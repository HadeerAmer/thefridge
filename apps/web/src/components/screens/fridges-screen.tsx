"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { LocateFixed, Navigation } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatDistance, walkingMinutes } from "@/lib/geo";
import { useLocationStore } from "@/stores/location";
import { machineStatusLabel, useSelectedMachine } from "../app/fridge-picker";
import { PageHeader } from "../app/header";
import { Button } from "../ui/button";
import { Badge, Card, Skeleton } from "../ui/primitives";

const MapView = dynamic(() => import("../app/map-view"), { ssr: false, loading: () => <Skeleton className="h-full rounded-none" /> });

/** Interactive map + nearest-first list of fridges with live stock and notices. */
export function FridgesScreen() {
  const router = useRouter();
  const { selected, machines, setMachine, coords } = useSelectedMachine();
  const { locate, status } = useLocationStore();

  return (
    <div>
      <PageHeader
        title="Find a fridge"
        back={false}
        action={
          <Button size="sm" variant="secondary" onClick={locate} loading={status === "locating"}>
            <LocateFixed className="size-4" /> Near me
          </Button>
        }
      />
      <div className="mx-4 h-[340px] overflow-hidden rounded-[24px] border border-line shadow-card">
        <MapView machines={machines} selectedId={selected?.id} you={coords} onSelect={setMachine} className="size-full" />
      </div>
      {status === "denied" && <p className="mx-4 mt-2 text-xs text-muted">Location is off — showing all fridges. Distances appear once you allow location.</p>}

      <ul className="mt-4 grid gap-3 px-4">
        {machines.map((m) => {
          const label = machineStatusLabel(m);
          const isSelected = m.id === selected?.id;
          return (
            <li key={m.id}>
              <Card className={cn("p-4", isSelected && "border-forest ring-2 ring-forest/15", !m.isSelling && "opacity-80")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-cream text-xl">
                    {m.kind === "campus" ? "🎓" : m.kind === "office" ? "🏢" : "🏖️"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold">{m.name}</p>
                      <Badge tone={label.tone}>{label.text}</Badge>
                    </div>
                    <p className="text-xs text-muted">{m.address}</p>
                    <p className="mt-1 text-xs text-muted">
                      {m.hours}
                      {m.distanceKm !== null && ` · ${formatDistance(m.distanceKm)}`}
                      {m.distanceKm !== null && m.distanceKm < 3 && ` · ${walkingMinutes(m.distanceKm)} min walk`}
                    </p>
                    {m.notice && <p className="mt-2 rounded-xl bg-sun/25 px-2.5 py-1.5 text-xs font-medium text-forest-ink">📢 {m.notice}</p>}
                    {m.isSelling && (
                      <p className="mt-2 text-xs font-semibold text-forest">
                        {m.units} items in stock · {m.temperatureC.toFixed(1)}°C
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={!m.isSelling}
                    variant={isSelected ? "secondary" : "primary"}
                    onClick={() => {
                      setMachine(m.id);
                      router.push("/");
                    }}
                  >
                    {isSelected ? "Selected — see menu" : "Shop this fridge"}
                  </Button>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-cream px-3 text-sm font-semibold text-forest"
                  >
                    <Navigation className="size-4" /> Directions
                  </a>
                </div>
              </Card>
            </li>
          );
        })}
        {machines.length === 0 && Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-32" />)}
      </ul>
    </div>
  );
}
