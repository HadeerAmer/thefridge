import { requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { cancelOrder } from "@/server/orders/service";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireUser();
  return { order: await cancelOrder(session.userId, (await params).id) };
});
