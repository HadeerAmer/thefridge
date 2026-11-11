import { getSession } from "@/server/auth/session";
import { route } from "@/server/http";
import { listRewards } from "@/server/loyalty/service";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  await getSession();
  return { rewards: await listRewards() };
});
