/** Daily targets from body stats (Mifflin-St Jeor). Pure, unit-tested. */

export type BodyProfile = {
  sex?: "female" | "male" | null;
  birthYear?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  activityLevel?: "sedentary" | "light" | "moderate" | "active" | "athlete" | null;
  goal?: "lose" | "maintain" | "gain" | null;
};

export type Targets = { kcal: number; proteinG: number; carbsG: number; fatG: number };
export type TargetsResult = Targets & { basis: "profile" | "default" | "custom" };

export const DEFAULT_TARGETS: Targets = { kcal: 2000, proteinG: 100, carbsG: 225, fatG: 67 };

const ACTIVITY: Record<NonNullable<BodyProfile["activityLevel"]>, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  athlete: 1.9,
};

export function computeTargets(
  profile: BodyProfile,
  overrides: Partial<Targets> = {},
  year = new Date().getFullYear(),
): TargetsResult {
  const custom = pickDefined(overrides);
  const { heightCm, weightKg, birthYear } = profile;
  if (!heightCm || !weightKg || !birthYear) {
    return { ...DEFAULT_TARGETS, ...custom, basis: Object.keys(custom).length ? "custom" : "default" };
  }

  const age = Math.min(90, Math.max(14, year - birthYear));
  const sexOffset = profile.sex === "male" ? 5 : profile.sex === "female" ? -161 : -78;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexOffset;
  const tdee = bmr * ACTIVITY[profile.activityLevel ?? "moderate"];
  const goal = profile.goal ?? "maintain";
  const kcal = Math.round((goal === "lose" ? tdee * 0.8 : goal === "gain" ? tdee * 1.1 : tdee) / 10) * 10;

  const proteinPerKg = goal === "lose" ? 2 : goal === "gain" ? 1.8 : 1.6;
  const proteinG = Math.round(weightKg * proteinPerKg);
  const fatG = Math.round((kcal * 0.3) / 9);
  const carbsG = Math.max(50, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));

  return { kcal, proteinG, carbsG, fatG, ...custom, basis: Object.keys(custom).length ? "custom" : "profile" };
}

function pickDefined(values: Partial<Targets>): Partial<Targets> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => typeof v === "number" && v > 0)) as Partial<Targets>;
}
