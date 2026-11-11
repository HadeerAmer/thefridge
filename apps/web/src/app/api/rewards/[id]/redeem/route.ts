import { requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { redeemReward } from "@/server/loyalty/service";
import { publish } from "@/server/realtime/bus";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireUser();
  const result = await redeemReward(session.userId, (await params).id);
  publish(`user:${session.userId}`, { type: "me" });
  return result;
});
