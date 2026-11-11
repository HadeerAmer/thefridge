import { describe, expect, it } from "vitest";
import { advanceStreak, applyStamps, isStreakAlive, pointsForSpend, tierFor } from "./rules";

const milestones = [
  { days: 3, points: 50 },
  { days: 7, points: 150 },
];
const opts = { weekendFreeze: true, milestones };

describe("tiers", () => {
  it("moves through Sprout → Leafy → Evergreen", () => {
    expect(tierFor(0).tier.name).toBe("Sprout");
    expect(tierFor(1499).pointsToNext).toBe(1);
    expect(tierFor(1500).tier.name).toBe("Leafy");
    expect(tierFor(4000).tier.name).toBe("Evergreen");
    expect(tierFor(4000).next).toBeNull();
  });

  it("earns points per pound with the tier multiplier", () => {
    expect(pointsForSpend(16200, 1, 1)).toBe(162);
    expect(pointsForSpend(16200, 1, 1.5)).toBe(243);
  });
});

describe("streaks", () => {
  it("counts consecutive days and pays milestone bonuses", () => {
    let s = { count: 0, best: 0, lastDate: null as string | null };
    s = advanceStreak(s, "2026-11-01", opts); // Sunday
    s = advanceStreak(s, "2026-11-02", opts); // Monday
    const third = advanceStreak(s, "2026-11-03", opts); // Tuesday
    expect(third.count).toBe(3);
    expect(third.milestone).toEqual({ days: 3, points: 50 });
  });

  it("is unchanged by a second purchase the same day", () => {
    const s = advanceStreak({ count: 2, best: 2, lastDate: "2026-11-02" }, "2026-11-02", opts);
    expect(s.changed).toBe(false);
    expect(s.count).toBe(2);
  });

  it("survives Friday + Saturday (Egypt's weekend)", () => {
    // Thursday → Sunday
    const s = advanceStreak({ count: 4, best: 4, lastDate: "2026-10-29" }, "2026-11-01", opts);
    expect(s.count).toBe(5);
    expect(isStreakAlive({ count: 4, best: 4, lastDate: "2026-10-29" }, "2026-11-01", true)).toBe(true);
  });

  it("breaks on a missed weekday", () => {
    // Monday → Wednesday
    const s = advanceStreak({ count: 4, best: 6, lastDate: "2026-11-02" }, "2026-11-04", opts);
    expect(s.count).toBe(1);
    expect(s.best).toBe(6);
  });

  it("breaks on weekends too when the freeze is off", () => {
    const s = advanceStreak({ count: 4, best: 4, lastDate: "2026-10-29" }, "2026-11-01", { ...opts, weekendFreeze: false });
    expect(s.count).toBe(1);
  });
});

describe("stamp card", () => {
  it("unlocks a free meal every N mains", () => {
    expect(applyStamps(8, 3, 10)).toEqual({ stamps: 1, freeMeals: 1 });
    expect(applyStamps(2, 1, 10)).toEqual({ stamps: 3, freeMeals: 0 });
    expect(applyStamps(5, 1, 0)).toEqual({ stamps: 5, freeMeals: 0 });
  });
});
