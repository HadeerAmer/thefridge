"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";
import type { LatLng } from "@/lib/geo";
import type { MachineDTO } from "@/lib/types";

/** Leaflet map with The Fridge pins on OpenStreetMap tiles (no API key). Load with next/dynamic, ssr: false. */

function pinIcon(label: string, tone: "open" | "closed" | "selected") {
  const bg = tone === "selected" ? "#f6c62f" : tone === "open" ? "#1f5a34" : "#9aa59d";
  const fg = tone === "selected" ? "#0f2a18" : "#ffffff";
  return L.divIcon({
    className: "",
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -46],
    html: `<div style="position:relative;width:44px;height:52px">
      <div style="position:absolute;left:2px;top:0;width:40px;height:40px;border-radius:20px 20px 20px 4px;transform:rotate(-45deg);background:${bg};border:3px solid #fffdf8;box-shadow:0 6px 14px rgba(15,42,24,.35)"></div>
      <div style="position:absolute;left:0;top:9px;width:44px;text-align:center;font:700 13px/20px var(--font-dm-sans),sans-serif;color:${fg}">${label}</div>
    </div>`,
  });
}

const youIcon = L.divIcon({
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
  html: `<div style="width:22px;height:22px;border-radius:50%;background:#2d6cb5;border:4px solid #fff;box-shadow:0 0 0 6px rgba(45,108,181,.25)"></div>`,
});

const courierIcon = L.divIcon({
  className: "",
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  html: `<div style="width:40px;height:40px;border-radius:50%;background:#f6c62f;border:3px solid #0f2a18;display:grid;place-items:center;font-size:20px;box-shadow:0 6px 14px rgba(15,42,24,.35)">🛵</div>`,
});

const homeIcon = L.divIcon({
  className: "",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  html: `<div style="width:36px;height:36px;border-radius:12px;background:#e2481f;border:3px solid #fff;display:grid;place-items:center;font-size:18px;box-shadow:0 6px 14px rgba(15,42,24,.35)">🏠</div>`,
});

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) map.setView([points[0]!.lat, points[0]!.lng], 14);
    else map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), { padding: [36, 36], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function MapView({
  machines,
  selectedId,
  you,
  onSelect,
  route,
  className,
}: {
  machines: MachineDTO[];
  selectedId?: string | null;
  you?: LatLng | null;
  onSelect?: (id: string) => void;
  /** Delivery tracking: fridge → courier → destination. */
  route?: { from: LatLng; to: LatLng; courier: LatLng | null };
  className?: string;
}) {
  const focus = useMemo(() => {
    if (route) return [route.from, route.to];
    const selling = machines.filter((m) => !m.isSeasonal);
    const pts = selling.map((m) => ({ lat: m.lat, lng: m.lng }));
    if (you) pts.push(you);
    return pts;
  }, [machines, you, route]);

  return (
    <MapContainer center={[30.05, 31.2]} zoom={10} scrollWheelZoom className={className} attributionControl>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <FitBounds points={focus} />
      {machines.map((m) => (
        <Marker
          key={m.id}
          position={[m.lat, m.lng]}
          icon={pinIcon(m.isSelling ? String(m.units) : "–", m.id === selectedId ? "selected" : m.isSelling ? "open" : "closed")}
          eventHandlers={{ click: () => onSelect?.(m.id) }}
        >
          <Popup>
            <strong>{m.name}</strong>
            <br />
            {m.isSelling ? `${m.units} items available` : (m.notice ?? "Not selling right now")}
          </Popup>
        </Marker>
      ))}
      {you && <Marker position={[you.lat, you.lng]} icon={youIcon} />}
      {route && (
        <>
          <Polyline positions={[[route.from.lat, route.from.lng], [route.to.lat, route.to.lng]]} pathOptions={{ color: "#1f5a34", weight: 4, dashArray: "8 10" }} />
          <Marker position={[route.to.lat, route.to.lng]} icon={homeIcon} />
          {route.courier && <Marker position={[route.courier.lat, route.courier.lng]} icon={courierIcon} />}
        </>
      )}
    </MapContainer>
  );
}
