import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { logCustom, logProduct } from "@/server/nutrition/service";

const Body = z.union([
  z.object({ productId: z.string(), qty: z.number().int().min(1).max(5).default(1) }),
  z.object({
    name: z.string().trim().min(2).max(60),
    kcal: z.number().int().min(0).max(3000),
    proteinG: z.number().min(0).max(300),
    carbsG: z.number().min(0).max(500),
    fatG: z.number().min(0).max(300),
  }),
]);

/** "I ate this" — manual diary entries. */
export const POST = route(async (req) => {
  const session = await requireUser();
  const body = await parseJson(req, Body);
  if ("productId" in body) await logProduct(session.userId, body.productId, body.qty);
  else await logCustom(session.userId, body);
  return { ok: true };
});
