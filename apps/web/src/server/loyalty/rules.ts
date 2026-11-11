import { addDays, daysBetween, weekday, WEEKEND_DAYS } from "@/lib/dates";

/** Loyalty rules — pure functions, unit-tested. */

export type Tier = { id: "sprout" | "leafy" | "evergreen"; name: string; minPoints: number; multiplier: number };

export const TIERS: Tier[] = [
  { id: "sprout", name: "Sprout", minPoints: 0, multiplier: 1 },
  { id: "leafy", name: "Leafy", minPoints: 1500, multiplier: 1.25 },
  { id: "evergreen", name: "Evergreen", minPoints: 4000, multiplier: 1.5 },
];

export function tierFor(lifetimePoints: number) {
  const index = TIERS.findLastIndex((t) => lifetimePoints >= t.minPoints);
  const tier = TIERS[Math.max(0, index)]!;
  const next = TIERS[index + 1] ?? null;
  const progress = next ? (lifetimePoints - tier.minPoints) / (next.minPoints - tier.minPoints) : 1;
  return { tier, next, progress: Math.min(1, Math.max(0, progress)), pointsToNext: next ? next.minPoints - lifetimePoints : 0 };
}

export function pointsForSpend(totalCents: number, pointsPerEgp: number, multiplier: number): number {
  return Math.floor((totalCents / 100) * pointsPerEgp * multiplier);
}

export type StreakState = { count: number; best: number; lastDate: string | null };

export type StreakUpdate = StreakState & {
  changed: boolean;
  /** Bonus earned by reaching a milestone today, if any. */
  milestone: { days: number; points: number } | null;
};

/**
 * A streak counts days with at least one Fridge meal. With `weekendFreeze`,
 * Friday/Saturday gaps don't break it ("Weekend plans? Do not disturb.").
 */
export function advanceStreak(
  state: StreakState,
  today: string,
  options: { weekendFreeze: boolean; milestones: { days: number; points: number }[] },
): StreakUpdate {
  if (state.lastDate === today) return { ...state, changed: false, milestone: null };

  let count = 1;
  if (state.lastDate && daysBetween(state.lastDate, today) > 0 && continues(state.lastDate, today, options.weekendFreeze)) {
    count = state.count + 1;
  }
  const best = Math.max(state.best, count);
  const milestone = options.milestones.find((m) => m.days === count) ?? null;
  return { count, best, lastDate: today, changed: true, milestone };
}

/** Is the streak still alive on `today` (without a new purchase)? */
export function isStreakAlive(state: StreakState, today: string, weekendFreeze: boolean): boolean {
  if (!state.lastDate || state.count === 0) return false;
  if (state.lastDate === today) return true;
  // Alive if every day between the last purchase and today (exclusive) is a free day,
  // i.e. buying today would continue it.
  return continues(state.lastDate, today, weekendFreeze);
}

function continues(lastDate: string, today: string, weekendFreeze: boolean): boolean {
  const gap = daysBetween(lastDate, today);
  if (gap <= 0) return true;
  for (let i = 1; i < gap; i++) {
    const day = addDays(lastDate, i);
    if (!weekendFreeze || !(WEEKEND_DAYS as readonly number[]).includes(weekday(day))) return false;
  }
  return true;
}

/** Stamp card: every `size`-th main is free. Returns how many free meals this purchase unlocks. */
export function applyStamps(current: number, mainsBought: number, size: number) {
  if (size <= 0) return { stamps: current, freeMeals: 0 };
  const total = current + mainsBought;
  return { stamps: total % size, freeMeals: Math.floor(total / size) };
}
