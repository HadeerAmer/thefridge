import "server-only";
import type { Types } from "mongoose";
import { formatEgp } from "@/lib/money";
import { User } from "../db/models";
import { withTransaction } from "../db/mongo";
import { feed, notify } from "../notifications";
import { publish } from "../realtime/bus";
import { creditWallet } from "../wallet";

export const REFERRAL_REWARD_CENTS = 5000;

/**
 * After a referred member's first fulfilled order, both members get wallet credit.
 * The guarded update (referralRewarded: false → true) makes it pay out exactly once.
 */
export async function rewardReferralIfDue(userId: Types.ObjectId): Promise<void> {
  const rewarded = await withTransaction(async (session) => {
    const friend = await User.findOneAndUpdate(
      { _id: userId, referredBy: { $ne: null }, referralRewarded: { $ne: true } },
      { $set: { referralRewarded: true } },
      { new: true, session },
    ).lean();
    if (!friend?.referredBy) return null;
    await creditWallet(friend._id, REFERRAL_REWARD_CENTS, { type: "reward", description: "Welcome gift — invited by a friend" }, session);
    await creditWallet(friend.referredBy, REFERRAL_REWARD_CENTS, { type: "reward", description: `Referral reward — ${friend.name} ate with us` }, session);
    return friend;
  });
  if (!rewarded?.referredBy) return;

  await notify(rewarded.referredBy, {
    kind: "loyalty",
    title: `${formatEgp(REFERRAL_REWARD_CENTS)} for you 🎁`,
    body: `${rewarded.name} collected their first meal with your code.`,
    href: "/wallet",
  });
  await notify(rewarded._id, {
    kind: "loyalty",
    title: `${formatEgp(REFERRAL_REWARD_CENTS)} welcome gift 🎁`,
    body: "Thanks for joining through a friend — it's in your wallet.",
    href: "/wallet",
  });
  publish(`user:${String(rewarded.referredBy)}`, { type: "me" });
  publish(`user:${String(rewarded._id)}`, { type: "me" });
  feed("payment", `Referral reward paid: ${rewarded.name} + their friend`);
}
