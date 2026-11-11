import "server-only";
import type { MachineDTO } from "@/lib/types";
import type { LatLng } from "@/lib/geo";
import { Machine, type MachineDoc } from "../db/models";

export type MachineLean = MachineDoc & { _id: string; distanceM?: number };

export function isSelling(m: Pick<MachineLean, "status" | "salesLocked" | "isSeasonal">): boolean {
  return m.status === "online" && !m.salesLocked && !m.isSeasonal;
}

export function toMachineDTO(m: MachineLean): MachineDTO {
  const [lng, lat] = m.location.coordinates as [number, number];
  return {
    id: m._id,
    name: m.name,
    venue: m.venue,
    area: m.area,
    address: m.address,
    lat,
    lng,
    kind: m.kind,
    hours: m.hours,
    isSeasonal: Boolean(m.isSeasonal),
    status: m.status,
    salesLocked: Boolean(m.salesLocked),
    temperatureC: m.temperatureC ?? 4,
    notice: m.notice ?? null,
    lastSeenAt: m.lastSeenAt ? new Date(m.lastSeenAt).toISOString() : null,
    isSelling: isSelling(m),
    distanceKm: typeof m.distanceM === "number" ? m.distanceM / 1000 : null,
    units: isSelling(m) ? (m.stock ?? []).reduce((sum, s) => sum + Math.max(0, s.onHand - s.held), 0) : 0,
  };
}

/**
 * All machines; nearest first when a location is given.
 * Uses MongoDB's $geoNear on the 2dsphere index for the distance.
 */
export async function listMachines(options: { near?: LatLng | null; withStock?: boolean } = {}): Promise<MachineLean[]> {
  const projection = options.withStock ? {} : { stock: 0 };
  if (options.near) {
    return Machine.aggregate<MachineLean>([
      {
        $geoNear: {
          near: { type: "Point", coordinates: [options.near.lng, options.near.lat] },
          distanceField: "distanceM",
          spherical: true,
        },
      },
      ...(options.withStock ? [] : [{ $project: projection }]),
    ]);
  }
  return Machine.find({}, projection).sort({ isSeasonal: 1, name: 1 }).lean<MachineLean[]>();
}

export async function listMachineDTOs(near?: LatLng | null): Promise<MachineDTO[]> {
  // Stock is needed to count available units.
  const machines = await listMachines({ near, withStock: true });
  return machines.map(toMachineDTO);
}

export async function getMachine(machineId: string): Promise<MachineLean | null> {
  return Machine.findById(machineId).lean<MachineLean>();
}
