import { requireUser } from "@/server/auth/session";
import { listProductRequests, voteProductRequest } from "@/server/feedback";
import { route } from "@/server/http";

export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireUser();
  await voteProductRequest(session.userId, (await params).id);
  return { requests: await listProductRequests(session.userId) };
});
