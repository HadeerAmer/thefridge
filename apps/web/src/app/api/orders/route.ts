import { requireUser } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { createOrder, CreateOrderSchema, listUserOrders } from "@/server/orders/service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await requireUser();
  return { orders: await listUserOrders(session.userId) };
});

/** Reserve (pickup) or order (delivery). Idempotent per `idempotencyKey`. */
export const POST = route(async (req) => {
  const session = await requireUser();
  const input = await parseJson(req, CreateOrderSchema);
  return { order: await createOrder(session.userId, input) };
});
