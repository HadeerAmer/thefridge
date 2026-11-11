import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { Product, StockAlert } from "@/server/db/models";
import { Errors } from "@/server/errors";
import { parseJson, route } from "@/server/http";

/** "Notify me when it's back" for a product, at one fridge or any. */
export const POST = route(async (req) => {
  const session = await requireUser();
  const { sku, machineId } = await parseJson(req, z.object({ sku: z.string(), machineId: z.string().nullable().optional() }));
  const product = await Product.findOne({ sku }, { name: 1 }).lean();
  if (!product) throw Errors.notFound("Product");
  await StockAlert.updateOne(
    { userId: session.userId, sku, machineId: machineId ?? null },
    { $set: { productName: product.name, notifiedAt: null } },
    { upsert: true },
  );
  return { ok: true };
});
