import { requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { removeAddress } from "@/server/users";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, { params }) => {
  const session = await requireUser();
  return { me: await removeAddress(session.userId, (await params).id) };
});
