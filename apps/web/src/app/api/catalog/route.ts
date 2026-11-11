import { z } from "zod";
import { getMenu } from "@/server/catalog";
import { parseQuery, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const { fridge } = parseQuery(req, z.object({ fridge: z.string().optional() }));
  return getMenu(fridge ?? null);
});
