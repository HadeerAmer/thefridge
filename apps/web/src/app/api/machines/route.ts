import { z } from "zod";
import { parseQuery, route } from "@/server/http";
import { listMachineDTOs } from "@/server/machines/service";

export const dynamic = "force-dynamic";

const Query = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const GET = route(async (req) => {
  const { lat, lng } = parseQuery(req, Query);
  const machines = await listMachineDTOs(lat !== undefined && lng !== undefined ? { lat, lng } : null);
  return { machines };
});
