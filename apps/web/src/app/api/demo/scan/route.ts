import { z } from "zod";
import { env } from "@/env";
import { requireUser } from "@/server/auth/session";
import { Order } from "@/server/db/models";
import { AppError, Errors } from "@/server/errors";
import { parseJson, route } from "@/server/http";

/**
 * Demo helper: "hold my phone up to the fridge" without a second screen.
 * Asks the simulated machine's scanner to read this order's pickup code.
 */
export const POST = route(async (req) => {
  if (!env.DEMO_MODE) throw Errors.notFound();
  const session = await requireUser();
  const { orderId } = await parseJson(req, z.object({ orderId: z.string() }));
  const order = await Order.findOne({ _id: orderId, userId: session.userId }, { pickupCode: 1, machineId: 1 }).lean();
  if (!order?.pickupCode) throw Errors.notFound("Order");

  const res = await fetch(`${env.FRIDGE_API_URL}/sim/machines/${encodeURIComponent(order.machineId)}/scan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: order.pickupCode }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!res) throw new AppError("machine_unreachable", "The fridge simulator isn't running.", 503);
  const session2 = (await res.json().catch(() => null)) as { status?: string; message?: string } | null;
  return { status: session2?.status ?? "unknown", message: session2?.message ?? "" };
});
