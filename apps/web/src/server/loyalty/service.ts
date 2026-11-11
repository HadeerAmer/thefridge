import "server-only";
import { Types } from "mongoose";
import { addDays, cairoDay, weekday, WEEKEND_DAYS } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import type { Celebration, LoyaltyDTO, RewardDTO, StreakDay } from "@/lib/types";
import { NutritionLog, Order, PointsTransaction, Reward, RewardRedemption, User, type OrderDoc, type UserDoc } from "../db/models";
import { withTransaction } from "../db/mongo";
import { AppError } from "../errors";
import { randomCode } from "../codes";
import { isMain } from "../pricing";
import { getSettings } from "../settings";
import { creditWallet } from "../wallet";
import { advanceStreak, applyStamps, isStreakAlive, pointsForSpend, tierFor } from "./rules";

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Awards points, streak and stamp-card progress for a fulfilled order.
 * Only called by the code path that won the order's status transition, so it runs once per order.
 */
export async function awardOrder(order: Pick<OrderDoc, "userId" | "items" | "totals" | "number"> & { _id: Types.ObjectId }): Promise<Celebration | null> {
  if (!order.userId) return null;
  const settings = await getSettings();
  if (!settings.loyalty.enabled) return null;
  const { loyalty } = settings;

  return withTransaction(async (session) => {
    const user = await User.findById(order.userId).session(session).lean<UserDoc>();
    if (!user) return null;

    const { tier } = tierFor(user.loyalty?.lifetimePoints ?? 0);
    const goodsCents = order.totals.totalCents - (order.totals.deliveryFeeCents ?? 0);
    const points = pointsForSpend(goodsCents, loyalty.pointsPerEgp, tier.multiplier);

    const streak = advanceStreak(
      {
        count: user.loyalty?.streakCount ?? 0,
        best: user.loyalty?.streakBest ?? 0,
        lastDate: user.loyalty?.streakLastDate ?? null,
      },
      cairoDay(),
      { weekendFreeze: loyalty.weekendFreeze, milestones: loyalty.streakMilestones },
    );
    const bonus = streak.milestone?.points ?? 0;

    const mains = order.items.filter((i) => isMain(i.category));
    const stamps = applyStamps(user.loyalty?.stampCount ?? 0, mains.reduce((n, i) => n + i.qty, 0), loyalty.stampCardSize);
    let freeMealCents = 0;
    if (stamps.freeMeals > 0 && mains.length > 0) {
      const cheapest = Math.min(...mains.map((i) => i.unitPriceCents));
      freeMealCents = cheapest * stamps.freeMeals;
      await creditWallet(
        user._id,
        freeMealCents,
        { type: "reward", description: `Stamp card: meal no. ${loyalty.stampCardSize} is on us`, orderId: order._id },
        session,
      );
    }

    await User.updateOne(
      { _id: user._id },
      {
        $inc: { "loyalty.points": points + bonus, "loyalty.lifetimePoints": points + bonus },
        $set: {
          "loyalty.streakCount": streak.count,
          "loyalty.streakBest": streak.best,
          "loyalty.streakLastDate": streak.lastDate,
          "loyalty.stampCount": stamps.stamps,
        },
      },
      { session },
    );

    const ledger = [{ userId: user._id, type: "earn", points, reason: `Order ${order.number}`, orderId: order._id }];
    if (bonus > 0) {
      ledger.push({ userId: user._id, type: "bonus", points: bonus, reason: `${streak.count}-day streak bonus`, orderId: order._id });
    }
    if (points + bonus > 0) await PointsTransaction.create(ledger, { session, ordered: true });
    await Order.updateOne({ _id: order._id }, { $set: { pointsEarned: points + bonus } }, { session });

    return { points, bonus, streak: streak.count, milestone: streak.milestone?.days ?? null, freeMealCents };
  });
}

/** Points + streak + tier as shown on Home and Rewards. */
export async function loyaltyFor(user: UserDoc): Promise<LoyaltyDTO> {
  const settings = await getSettings();
  const lifetime = user.loyalty?.lifetimePoints ?? 0;
  const { tier, next, progress, pointsToNext } = tierFor(lifetime);
  const today = cairoDay();
  const state = {
    count: user.loyalty?.streakCount ?? 0,
    best: user.loyalty?.streakBest ?? 0,
    lastDate: user.loyalty?.streakLastDate ?? null,
  };
  const alive = isStreakAlive(state, today, settings.loyalty.weekendFreeze);

  // Days with at least one Fridge meal in the last week.
  const since = new Date(Date.now() - 8 * 86_400_000);
  const days = await NutritionLog.aggregate<{ _id: string }>([
    { $match: { userId: user._id, source: "order", eatenAt: { $gte: since } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$eatenAt", timezone: "Africa/Cairo" } } } },
  ]);
  const doneDays = new Set(days.map((d) => d._id));

  const week: StreakDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i - 6);
    const isWeekend = (WEEKEND_DAYS as readonly number[]).includes(weekday(day));
    let status: StreakDay["status"];
    if (doneDays.has(day)) status = "done";
    else if (day === today) status = "today";
    else if (isWeekend && settings.loyalty.weekendFreeze) status = "rest";
    else status = "missed";
    return { day, label: DAY_LABELS[weekday(day)]!, status };
  });

  return {
    points: user.loyalty?.points ?? 0,
    lifetimePoints: lifetime,
    tier: { id: tier.id, name: tier.name, multiplier: tier.multiplier },
    nextTier: next ? { name: next.name, minPoints: next.minPoints } : null,
    tierProgress: progress,
    pointsToNext,
    streak: { count: alive ? state.count : 0, best: state.best, alive, week },
    stamps: { count: user.loyalty?.stampCount ?? 0, size: settings.loyalty.stampCardSize },
  };
}

export async function listRewards(): Promise<RewardDTO[]> {
  const rewards = await Reward.find({ isActive: true }).sort({ sortOrder: 1, costPoints: 1 }).lean();
  return rewards.map((r) => ({
    id: String(r._id),
    slug: r.slug,
    name: r.name,
    description: r.description,
    costPoints: r.costPoints,
    kind: r.kind,
    valueCents: r.valueCents ?? 0,
  }));
}

export async function redeemReward(userId: string, rewardId: string) {
  if (!Types.ObjectId.isValid(rewardId)) throw new AppError("not_found", "Reward not found.", 404);
  const reward = await Reward.findOne({ _id: rewardId, isActive: true }).lean();
  if (!reward) throw new AppError("not_found", "Reward not found.", 404);

  return withTransaction(async (session) => {
    const user = await User.findOneAndUpdate(
      { _id: userId, "loyalty.points": { $gte: reward.costPoints } },
      { $inc: { "loyalty.points": -reward.costPoints } },
      { new: true, session },
    ).lean<UserDoc>();
    if (!user) throw new AppError("not_enough_points", `You need ${reward.costPoints} points for this reward.`, 402);

    await PointsTransaction.create(
      [{ userId, type: "redeem", points: -reward.costPoints, reason: `Redeemed: ${reward.name}` }],
      { session },
    );
    const code = `RW-${randomCode(6)}`;
    await RewardRedemption.create([{ userId, rewardId: reward._id, rewardName: reward.name, code }], { session });

    let walletCents = user.walletCents;
    if (reward.kind === "wallet_credit" && reward.valueCents) {
      walletCents = await creditWallet(userId, reward.valueCents, { type: "reward", description: `Reward: ${reward.name}` }, session);
    }
    return {
      code,
      points: user.loyalty?.points ?? 0,
      walletCents,
      message:
        reward.kind === "wallet_credit"
          ? `${formatEgp(reward.valueCents ?? 0)} added to your wallet.`
          : `Show code ${code} to The Fridge team to collect it.`,
    };
  });
}

/** Points earned at sign-up. */
export async function grantSignupBonus(userId: Types.ObjectId, points: number) {
  if (points <= 0) return;
  await User.updateOne({ _id: userId }, { $inc: { "loyalty.points": points, "loyalty.lifetimePoints": points } });
  await PointsTransaction.create({ userId, type: "bonus", points, reason: "Welcome to The Fridge" });
}
