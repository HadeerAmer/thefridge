import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import type { MeDTO } from "@/lib/types";
import { User, type UserDoc } from "./db/models";
import { AppError } from "./errors";
import { newReferralCode } from "./codes";
import { loyaltyFor, grantSignupBonus } from "./loyalty/service";
import { computeTargets } from "./nutrition/goals";
import { getSettings } from "./settings";
import { publish } from "./realtime/bus";

export const PhoneSchema = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^(\+20|0)?1[0125]\d{8}$/, "Enter an Egyptian mobile number, e.g. 010 1234 5678"))
  .transform((v) => `+20${v.replace(/^(\+20|0)/, "")}`);

export const ProfilePatchSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  email: z.email().optional().or(z.literal("")),
  sex: z.enum(["female", "male"]).nullable().optional(),
  birthYear: z.number().int().min(1930).max(new Date().getFullYear() - 12).nullable().optional(),
  heightCm: z.number().int().min(120).max(230).nullable().optional(),
  weightKg: z.number().min(30).max(250).nullable().optional(),
  activityLevel: z.enum(["sedentary", "light", "moderate", "active", "athlete"]).optional(),
  goal: z.enum(["lose", "maintain", "gain"]).optional(),
  dietPrefs: z.array(z.string().max(30)).max(10).optional(),
  allergens: z.array(z.string().max(30)).max(12).optional(),
  targets: z
    .object({
      kcal: z.number().int().min(800).max(6000).nullable(),
      proteinG: z.number().int().min(20).max(400).nullable(),
      carbsG: z.number().int().min(0).max(800).nullable(),
      fatG: z.number().int().min(10).max(300).nullable(),
    })
    .partial()
    .optional(),
  favoriteMachineId: z.string().max(64).nullable().optional(),
});
export type ProfilePatch = z.infer<typeof ProfilePatchSchema>;

export const AddressInputSchema = z.object({
  label: z.string().trim().min(1).max(30),
  line1: z.string().trim().min(3).max(160),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Email domains we accept for the student discount (demo list). */
const STUDENT_DOMAINS = [".edu.eg", "miuegypt.edu.eg", "msa.edu.eg", "tkh.edu.eg", "coventry.ac.uk", ".edu"];

export async function findOrCreateUser(phone: string, name?: string, referralCode?: string) {
  const existing = await User.findOne({ phone }).lean<UserDoc>();
  if (existing) return { user: existing, created: false };
  const displayName = name?.trim() || "Fridge friend";
  const referrer = referralCode ? await User.findOne({ referralCode: referralCode.trim().toUpperCase() }, { _id: 1 }).lean() : null;
  const created = await User.create({
    phone,
    name: displayName,
    referralCode: newReferralCode(displayName),
    referredBy: referrer?._id,
  });
  const settings = await getSettings();
  await grantSignupBonus(created._id, settings.loyalty.signupBonusPoints);
  const user = await User.findById(created._id).lean<UserDoc>();
  return { user: user!, created: true };
}

export async function getUserDoc(userId: string): Promise<UserDoc> {
  if (!Types.ObjectId.isValid(userId)) throw new AppError("unauthorized", "Please sign in again.", 401);
  const user = await User.findById(userId).lean<UserDoc>();
  if (!user) throw new AppError("unauthorized", "Please sign in again.", 401);
  return user;
}

export async function getMe(userId: string): Promise<MeDTO> {
  const user = await getUserDoc(userId);
  return toMeDTO(user);
}

export async function toMeDTO(user: UserDoc): Promise<MeDTO> {
  const p = user.profile ?? {};
  const targets = computeTargets(
    {
      sex: p.sex ?? null,
      birthYear: p.birthYear ?? null,
      heightCm: p.heightCm ?? null,
      weightKg: p.weightKg ?? null,
      activityLevel: p.activityLevel ?? "moderate",
      goal: p.goal ?? "maintain",
    },
    {
      kcal: user.targets?.kcal ?? undefined,
      proteinG: user.targets?.proteinG ?? undefined,
      carbsG: user.targets?.carbsG ?? undefined,
      fatG: user.targets?.fatG ?? undefined,
    },
  );
  return {
    id: String(user._id),
    name: user.name,
    phone: user.phone,
    email: user.email ?? null,
    role: user.role === "admin" ? "admin" : "customer",
    referralCode: user.referralCode,
    walletCents: user.walletCents ?? 0,
    favoriteMachineId: user.favoriteMachineId ?? null,
    profile: {
      sex: p.sex ?? null,
      birthYear: p.birthYear ?? null,
      heightCm: p.heightCm ?? null,
      weightKg: p.weightKg ?? null,
      activityLevel: p.activityLevel ?? "moderate",
      goal: p.goal ?? "maintain",
      dietPrefs: p.dietPrefs ?? [],
      allergens: p.allergens ?? [],
    },
    targets,
    student: { email: user.student?.email ?? null, verified: Boolean(user.student?.verified) },
    addresses: (user.addresses ?? []).map((a) => ({
      id: String((a as { _id?: unknown })._id),
      label: a.label,
      line1: a.line1,
      lat: a.lat,
      lng: a.lng,
    })),
    loyalty: await loyaltyFor(user),
  };
}

export async function updateProfile(userId: string, patch: ProfilePatch): Promise<MeDTO> {
  const set: Record<string, unknown> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.email !== undefined) set.email = patch.email || null;
  for (const key of ["sex", "birthYear", "heightCm", "weightKg", "activityLevel", "goal", "dietPrefs", "allergens"] as const) {
    if (patch[key] !== undefined) set[`profile.${key}`] = patch[key];
  }
  if (patch.targets) {
    for (const [key, value] of Object.entries(patch.targets)) set[`targets.${key}`] = value ?? null;
  }
  if (patch.favoriteMachineId !== undefined) set.favoriteMachineId = patch.favoriteMachineId;
  await User.updateOne({ _id: userId }, { $set: set });
  publish(`user:${userId}`, { type: "me" });
  return getMe(userId);
}

export async function addAddress(userId: string, input: z.infer<typeof AddressInputSchema>): Promise<MeDTO> {
  await User.updateOne({ _id: userId }, { $push: { addresses: { $each: [input], $slice: -5 } } });
  return getMe(userId);
}

export async function removeAddress(userId: string, addressId: string): Promise<MeDTO> {
  await User.updateOne({ _id: userId }, { $pull: { addresses: { _id: addressId } } });
  return getMe(userId);
}

export async function verifyStudent(userId: string, email: string): Promise<MeDTO> {
  const normalized = email.trim().toLowerCase();
  const ok = STUDENT_DOMAINS.some((d) => normalized.endsWith(d.startsWith(".") ? d : `@${d}`));
  if (!ok) {
    throw new AppError("not_student_email", "Use your university email (e.g. name@miuegypt.edu.eg or name@msa.edu.eg).", 400);
  }
  // Demo: verified instantly. Production: email a one-time link first.
  await User.updateOne({ _id: userId }, { $set: { student: { email: normalized, verified: true } } });
  publish(`user:${userId}`, { type: "me" });
  return getMe(userId);
}
