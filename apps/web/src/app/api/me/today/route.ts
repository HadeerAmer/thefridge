import { requireUser } from "@/server/auth/session";
import { route } from "@/server/http";
import { today, lastSevenDays } from "@/server/nutrition/service";
import { usualItem } from "@/server/orders/service";
import { getMe } from "@/server/users";

export const dynamic = "force-dynamic";

/** Everything Home needs to show progress on open: today's macros, the week, and "your usual". */
export const GET = route(async () => {
  const session = await requireUser();
  const me = await getMe(session.userId);
  const [todayDTO, week, usual] = await Promise.all([
    today(session.userId, me.targets),
    lastSevenDays(session.userId),
    usualItem(session.userId),
  ]);
  return { today: todayDTO, week, usual };
});
