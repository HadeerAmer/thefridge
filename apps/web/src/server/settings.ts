import "server-only";
import { z } from "zod";
import { Setting } from "./db/models";

/**
 * Business settings the admin controls (Admin → Settings).
 * Stored as one document; every field has a default so a fresh database just works.
 */
export const SettingsSchema = z.object({
  reservation: z
    .object({
      /** How long a reserved item is held in the fridge. */
      holdMinutes: z.number().int().min(5).max(120).default(15),
      maxActivePerUser: z.number().int().min(1).max(5).default(2),
    })
    .prefault({}),
  delivery: z
    .object({
      enabled: z.boolean().default(true),
      holdMinutes: z.number().int().min(15).max(240).default(45),
      baseFeeCents: z.number().int().min(0).default(2500),
      perKmCents: z.number().int().min(0).default(400),
      maxKm: z.number().min(1).max(50).default(15),
      freeOverCents: z.number().int().min(0).default(50000),
      /** Simulate drivers automatically (demo). */
      autoDispatch: z.boolean().default(true),
      /** Demo speed-up for the courier simulation. */
      demoSpeed: z.number().min(0.25).max(10).default(1),
    })
    .prefault({}),
  pricing: z
    .object({
      /** App-only price: % off the machine price for orders placed in the app. */
      appDiscountPercent: z.number().min(0).max(50).default(5),
      happyHour: z
        .object({
          enabled: z.boolean().default(true),
          startHour: z.number().int().min(0).max(23).default(15),
          endHour: z.number().int().min(1).max(24).default(17),
          percent: z.number().min(0).max(60).default(15),
        })
        .prefault({}),
      freshSaver: z
        .object({
          enabled: z.boolean().default(true),
          hoursBeforeExpiry: z.number().min(1).max(48).default(6),
          percent: z.number().min(0).max(80).default(30),
        })
        .prefault({}),
      combo: z
        .object({
          enabled: z.boolean().default(true),
          drinkDiscountCents: z.number().int().min(0).default(2000),
        })
        .prefault({}),
      studentPercent: z.number().min(0).max(50).default(10),
    })
    .prefault({}),
  loyalty: z
    .object({
      enabled: z.boolean().default(true),
      pointsPerEgp: z.number().min(0).max(10).default(1),
      weekendFreeze: z.boolean().default(true),
      streakMilestones: z
        .array(z.object({ days: z.number().int().min(2), points: z.number().int().min(1) }))
        .default([
          { days: 3, points: 50 },
          { days: 7, points: 150 },
          { days: 14, points: 300 },
          { days: 30, points: 750 },
        ]),
      /** Every Nth meal is free (credited to the wallet). 0 disables the stamp card. */
      stampCardSize: z.number().int().min(0).max(30).default(10),
      signupBonusPoints: z.number().int().min(0).default(100),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;

const KEY = "app";
const TTL_MS = 3000;
const globalForSettings = globalThis as unknown as { __settings?: { value: Settings; at: number } };

export async function getSettings(): Promise<Settings> {
  const cached = globalForSettings.__settings;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const doc = await Setting.findById(KEY).lean();
  const value = SettingsSchema.parse(doc?.value ?? {});
  globalForSettings.__settings = { value, at: Date.now() };
  return value;
}

export async function saveSettings(next: Settings): Promise<Settings> {
  const value = SettingsSchema.parse(next);
  await Setting.updateOne({ _id: KEY }, { $set: { value } }, { upsert: true });
  globalForSettings.__settings = { value, at: Date.now() };
  return value;
}
