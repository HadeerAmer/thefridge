import { requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { removeEntry } from "@/server/nutrition/service";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireUser();
  await removeEntry(session.userId, (await params).id);
  return { ok: true };
});
