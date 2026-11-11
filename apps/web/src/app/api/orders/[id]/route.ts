import { requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { getUserOrder } from "@/server/orders/service";

export const dynamic = "force-dynamic";

export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireUser();
  return { order: await getUserOrder(session.userId, (await params).id) };
});
