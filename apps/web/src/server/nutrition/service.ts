import "server-only";
import { Types, type ClientSession } from "mongoose";
import { addDays, cairoDay, startOfCairoDay, weekday } from "@/lib/dates";
import type { DiaryEntryDTO, Nutrition, TargetsDTO, TodayDTO, WeekDayDTO } from "@/lib/types";
import { NutritionLog, Product, type OrderDoc } from "../db/models";
import { AppError } from "../errors";

/** Food diary: filled automatically when an order is collected or delivered. */

const ZERO: Nutrition = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function logOrderNutrition(
  order: Pick<OrderDoc, "userId" | "items"> & { _id: Types.ObjectId },
  session?: ClientSession,
): Promise<void> {
  if (!order.userId) return;
  const now = new Date();
  await NutritionLog.insertMany(
    order.items.map((item) => ({
      userId: order.userId,
      productId: item.productId,
      name: item.name,
      qty: item.qty,
      kcal: Math.round((item.nutrition?.kcal ?? 0) * item.qty),
      proteinG: round1((item.nutrition?.proteinG ?? 0) * item.qty),
      carbsG: round1((item.nutrition?.carbsG ?? 0) * item.qty),
      fatG: round1((item.nutrition?.fatG ?? 0) * item.qty),
      source: "order",
      orderId: order._id,
      eatenAt: now,
    })),
    { session },
  );
}

export async function today(userId: string, targets: TargetsDTO): Promise<TodayDTO> {
  const from = startOfCairoDay();
  const docs = await NutritionLog.find({ userId, eatenAt: { $gte: from } }).sort({ eatenAt: -1 }).lean();
  const entries: DiaryEntryDTO[] = docs.map((d) => ({
    id: String(d._id),
    name: d.name,
    qty: d.qty ?? 1,
    kcal: d.kcal,
    proteinG: d.proteinG,
    carbsG: d.carbsG,
    fatG: d.fatG,
    source: d.source,
    eatenAt: d.eatenAt.toISOString(),
  }));
  return { day: cairoDay(), consumed: sumNutrition(entries), targets, entries };
}

export async function lastSevenDays(userId: string): Promise<WeekDayDTO[]> {
  const todayKey = cairoDay();
  const since = startOfCairoDay(new Date(Date.now() - 6 * 86_400_000));
  const rows = await NutritionLog.aggregate<Nutrition & { _id: string }>([
    { $match: { userId: new Types.ObjectId(userId), eatenAt: { $gte: since } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$eatenAt", timezone: "Africa/Cairo" } },
        kcal: { $sum: "$kcal" },
        proteinG: { $sum: "$proteinG" },
        carbsG: { $sum: "$carbsG" },
        fatG: { $sum: "$fatG" },
      },
    },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(todayKey, i - 6);
    const row = byDay.get(day);
    return {
      day,
      label: day === todayKey ? "Today" : DAY_NAMES[weekday(day)]!,
      kcal: Math.round(row?.kcal ?? 0),
      proteinG: round1(row?.proteinG ?? 0),
      carbsG: round1(row?.carbsG ?? 0),
      fatG: round1(row?.fatG ?? 0),
    };
  });
}

/** "I ate this" — log a menu item eaten without an app order (e.g. bought with cash). */
export async function logProduct(userId: string, productId: string, qty = 1): Promise<void> {
  if (!Types.ObjectId.isValid(productId)) throw new AppError("not_found", "Product not found.", 404);
  const product = await Product.findById(productId).lean();
  if (!product) throw new AppError("not_found", "Product not found.", 404);
  await NutritionLog.create({
    userId,
    productId: product._id,
    name: product.name,
    qty,
    kcal: product.nutrition.kcal * qty,
    proteinG: round1(product.nutrition.proteinG * qty),
    carbsG: round1(product.nutrition.carbsG * qty),
    fatG: round1(product.nutrition.fatG * qty),
    source: "manual",
  });
}

export async function logCustom(userId: string, entry: Nutrition & { name: string }): Promise<void> {
  await NutritionLog.create({ userId, ...entry, qty: 1, source: "manual" });
}

export async function removeEntry(userId: string, entryId: string): Promise<void> {
  if (!Types.ObjectId.isValid(entryId)) return;
  await NutritionLog.deleteOne({ _id: entryId, userId });
}

export function sumNutrition(rows: Nutrition[]): Nutrition {
  return rows.reduce(
    (acc, r) => ({
      kcal: acc.kcal + r.kcal,
      proteinG: round1(acc.proteinG + r.proteinG),
      carbsG: round1(acc.carbsG + r.carbsG),
      fatG: round1(acc.fatG + r.fatG),
    }),
    ZERO,
  );
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
