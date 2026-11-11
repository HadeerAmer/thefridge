import { requireUser } from "@/server/auth/session";
import { User } from "@/server/db/models";
import { route } from "@/server/http";
import { walletHistory } from "@/server/wallet";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await requireUser();
  const [user, transactions] = await Promise.all([
    User.findById(session.userId, { walletCents: 1 }).lean(),
    walletHistory(session.userId),
  ]);
  return { walletCents: user?.walletCents ?? 0, transactions };
});
