import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { CardSchema, TOPUP_METHODS } from "@/server/payments";
import { topUp } from "@/server/wallet";

const Body = z
  .object({
    amountCents: z.number().int().min(2000).max(1_000_000),
    method: z.enum(TOPUP_METHODS),
    card: CardSchema.optional(),
  })
  .refine((v) => v.method !== "card" || v.card, { path: ["card"], message: "Add card details" });

export const POST = route(async (req) => {
  const session = await requireUser();
  return topUp(session.userId, await parseJson(req, Body));
});
