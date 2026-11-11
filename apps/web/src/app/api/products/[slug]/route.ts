import { z } from "zod";
import { getProduct } from "@/server/catalog";
import { Errors } from "@/server/errors";
import { parseQuery, route } from "@/server/http";

export const dynamic = "force-dynamic";

const Query = z.object({
  fridge: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const GET = route<{ params: Promise<{ slug: string }> }>(async (req, { params }) => {
  const { slug } = await params;
  const q = parseQuery(req, Query);
  const result = await getProduct(slug, {
    machineId: q.fridge ?? null,
    near: q.lat !== undefined && q.lng !== undefined ? { lat: q.lat, lng: q.lng } : null,
  });
  if (!result) throw Errors.notFound("Product");
  return result;
});
