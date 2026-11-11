import { getSession, requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { listNotifications, markAllRead } from "@/server/notifications";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await getSession();
  return { notifications: session ? await listNotifications(session.userId) : [] };
});

/** Mark everything read. */
export const POST = route(async () => {
  const session = await requireUser();
  await markAllRead(session.userId);
  return { ok: true };
});
