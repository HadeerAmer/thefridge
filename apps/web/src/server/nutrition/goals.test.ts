import { describe, expect, it } from "vitest";
import { computeTargets, DEFAULT_TARGETS } from "./goals";

describe("computeTargets", () => {
  it("falls back to defaults without body stats", () => {
    expect(computeTargets({})).toEqual({ ...DEFAULT_TARGETS, basis: "default" });
  });

  it("uses Mifflin-St Jeor with activity and goal", () => {
    const t = computeTargets({ sex: "female", birthYear: 2001, heightCm: 166, weightKg: 61, activityLevel: "active", goal: "maintain" }, {}, 2026);
    // BMR = 610 + 1037.5 − 125 − 161 = 1361.5; × 1.725 = 2348.6 → 2350
    expect(t.kcal).toBe(2350);
    expect(t.proteinG).toBe(98); // 1.6 g/kg
    expect(t.basis).toBe("profile");
  });

  it("cuts calories and raises protein for weight loss", () => {
    const maintain = computeTargets({ sex: "male", birthYear: 1996, heightCm: 180, weightKg: 85 }, {}, 2026);
    const lose = computeTargets({ sex: "male", birthYear: 1996, heightCm: 180, weightKg: 85, goal: "lose" }, {}, 2026);
    expect(lose.kcal).toBeLessThan(maintain.kcal);
    expect(lose.proteinG).toBe(170); // 2 g/kg
  });

  it("respects manual overrides", () => {
    const t = computeTargets({ heightCm: 170, weightKg: 70, birthYear: 1995 }, { proteinG: 150 }, 2026);
    expect(t.proteinG).toBe(150);
    expect(t.basis).toBe("custom");
  });
});
