"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { ChevronRight, QrCode } from "lucide-react";
import { useMe, useOrders } from "@/lib/queries";
import type { OrderDTO } from "@/lib/types";
import { Ring } from "./progress";

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** QR the fridge's scanner reads — just the pickup code. */
export function PickupQr({ code, size = 220 }: { code: string; size?: number }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toString(code, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f2a18", light: "#ffffff" } })
      .then((markup) => !cancelled && setSvg(markup))
      .catch(() => setSvg(""));
    return () => {
      cancelled = true;
    };
  }, [code]);
  return (
    <div
      className="rounded-2xl bg-white p-3 shadow-card [&_svg]:size-full"
      style={{ width: size, height: size }}
      aria-label={`QR code for pickup code ${code}`}
      role="img"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

export function HoldCountdown({ order, size = 64 }: { order: OrderDTO; size?: number }) {
  const now = useNow();
  if (!order.holdExpiresAt) return null;
  const end = Date.parse(order.holdExpiresAt);
  const start = Date.parse(order.timeline.reservedAt ?? order.createdAt);
  const left = end - now;
  return (
    <Ring value={left} max={end - start} size={size} stroke={size > 80 ? 10 : 6} color={left < 3 * 60_000 ? "#e2481f" : "#1f5a34"}>
      <span className={size > 80 ? "font-display text-2xl text-forest-dark" : "font-display text-sm text-forest-dark"}>{formatCountdown(left)}</span>
    </Ring>
  );
}

/** Pinned at the top of Home while something is waiting for you. */
export function ActivePickupBanner() {
  const { data: me } = useMe();
  const { data: orders } = useOrders(Boolean(me));
  const active = orders?.find((o) => o.status === "reserved") ?? orders?.find((o) => ["placed", "assigned", "picked_up", "on_the_way"].includes(o.status));
  if (!active) return null;

  const isPickup = active.status === "reserved";
  return (
    <Link
      href={`/orders/${active.id}`}
      className="flex animate-rise items-center gap-3 rounded-[22px] bg-forest p-3 pr-4 text-white shadow-float"
    >
      {isPickup ? (
        <div className="rounded-full bg-paper">
          <HoldCountdown order={active} size={56} />
        </div>
      ) : (
        <span className="grid size-14 place-items-center rounded-full bg-sun text-2xl">🛵</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white/70">{isPickup ? "Reserved for you at" : "Your delivery"}</p>
        <p className="truncate font-semibold">{isPickup ? active.machine.name : active.status.replace(/_/g, " ")}</p>
        <p className="truncate text-xs text-white/80">{active.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
      </div>
      <span className="flex items-center gap-1 rounded-full bg-sun px-3 py-1.5 text-sm font-bold text-forest-ink">
        {isPickup ? (
          <>
            <QrCode className="size-4" /> QR
          </>
        ) : (
          <>
            Track <ChevronRight className="size-4" />
          </>
        )}
      </span>
    </Link>
  );
}
