"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, LocateFixed, MapPin } from "lucide-react";
import { formatDistance, walkingMinutes } from "@/lib/geo";
import { useMachines } from "@/lib/queries";
import type { MachineDTO } from "@/lib/types";
import { useLocationStore } from "@/stores/location";
import { cn } from "@/lib/cn";
import { Sheet } from "../ui/sheet";
import { Badge } from "../ui/primitives";

/** Picks the nearest selling fridge automatically; the chip opens a sheet to switch. */
export function useSelectedMachine(initial?: MachineDTO[]) {
  const { machineId, coords, setMachine, locate, status } = useLocationStore();
  const { data: machines = [] } = useMachines(coords, coords ? undefined : initial);

  useEffect(() => {
    if (status === "idle" && !coords) locate();
  }, [status, coords, locate]);

  const selected = useMemo(() => {
    const chosen = machines.find((m) => m.id === machineId);
    if (chosen) return chosen;
    return machines.find((m) => m.isSelling) ?? machines[0] ?? null;
  }, [machines, machineId]);

  useEffect(() => {
    if (selected && selected.id !== machineId) setMachine(selected.id);
  }, [selected, machineId, setMachine]);

  return { selected, machines, setMachine, coords };
}

export function machineStatusLabel(m: MachineDTO): { text: string; tone: "green" | "tomato" | "neutral" | "sun" } {
  if (m.isSeasonal) return { text: "Back next summer", tone: "neutral" };
  if (m.status !== "online") return { text: m.status === "maintenance" ? "Maintenance" : "Offline", tone: "tomato" };
  if (m.salesLocked) return { text: "Paused", tone: "sun" };
  return { text: "Open", tone: "green" };
}

export function FridgePickerChip({ initial }: { initial?: MachineDTO[] }) {
  const { selected, machines, setMachine } = useSelectedMachine(initial);
  const [open, setOpen] = useState(false);
  const { locate, status } = useLocationStore();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-1.5 rounded-full bg-paper py-1.5 pr-2.5 pl-2 text-left text-sm shadow-card"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest text-white">
          <MapPin className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold leading-tight">{selected?.name ?? "Choose a fridge"}</span>
          {selected && (
            <span className="block truncate text-[11px] leading-tight text-muted">
              {selected.distanceKm !== null ? `${formatDistance(selected.distanceKm)} · ` : ""}
              {machineStatusLabel(selected).text}
            </span>
          )}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Choose your fridge" description="Stock and prices follow the fridge you pick.">
        <button
          type="button"
          onClick={locate}
          className="mb-3 flex w-full items-center gap-2 rounded-2xl bg-cream px-4 py-3 text-sm font-semibold text-forest"
        >
          <LocateFixed className="size-4" />
          {status === "locating" ? "Finding you…" : status === "granted" ? "Sorted by distance from you" : "Use my location to sort by distance"}
        </button>
        <ul className="grid gap-2">
          {machines.map((m) => {
            const status = machineStatusLabel(m);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  disabled={!m.isSelling && !m.isSeasonal && m.status !== "online"}
                  onClick={() => {
                    setMachine(m.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition",
                    m.id === selected?.id ? "border-forest bg-forest/5" : "border-line bg-paper",
                    !m.isSelling && "opacity-70",
                  )}
                >
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream text-lg">
                    {m.kind === "campus" ? "🎓" : m.kind === "office" ? "🏢" : "🏖️"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{m.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {m.area}
                      {m.distanceKm !== null && ` · ${formatDistance(m.distanceKm)}${m.distanceKm < 3 ? ` · ${walkingMinutes(m.distanceKm)} min walk` : ""}`}
                    </span>
                    {m.notice && <span className="mt-1 block text-xs text-tomato">📢 {m.notice}</span>}
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Badge tone={status.tone}>{status.text}</Badge>
                    {m.isSelling && <span className="text-[11px] text-muted">{m.units} items</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    </>
  );
}
