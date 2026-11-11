import { cairoHour } from "@/lib/dates";
import { percentOff, roundToPound } from "@/lib/money";
import type { Settings } from "./settings";

/**
 * Pricing rules — pure functions, unit-tested.
 * Item promos don't stack: the best of app price / happy hour / fresh-saver wins.
 * Cart-level promos (combo, student) apply on top.
 */

export type PricingProduct = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  priceCents: number;
};

export type PromoKind = "app" | "happy_hour" | "fresh_saver";

export const PROMO_LABELS: Record<PromoKind, string> = {
  app: "App price",
  happy_hour: "Happy hour",
  fresh_saver: "Fresh-saver",
};

export type UnitPrice = { unitCents: number; listCents: number; promo: PromoKind | null; label: string | null };

export type PriceContext = {
  now: Date;
  /** Nearest expiry of each SKU at the fridge the order comes from. */
  expiries?: Map<string, Date | null>;
  isStudent?: boolean;
  deliveryFeeCents?: number;
};

const MAIN_CATEGORIES = new Set(["salad", "wrap", "sandwich", "bowl"]);
export const isMain = (category: string) => MAIN_CATEGORIES.has(category);

export function isHappyHour(now: Date, pricing: Settings["pricing"]): boolean {
  const { enabled, startHour, endHour } = pricing.happyHour;
  if (!enabled) return false;
  const hour = cairoHour(now);
  return startHour <= endHour ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
}

export function isFreshSaver(expiry: Date | null | undefined, now: Date, pricing: Settings["pricing"]): boolean {
  if (!pricing.freshSaver.enabled || !expiry) return false;
  const hoursLeft = (expiry.getTime() - now.getTime()) / 3_600_000;
  return hoursLeft > 0 && hoursLeft <= pricing.freshSaver.hoursBeforeExpiry;
}

export function unitPrice(
  product: Pick<PricingProduct, "sku" | "priceCents">,
  ctx: Pick<PriceContext, "now" | "expiries">,
  pricing: Settings["pricing"],
): UnitPrice {
  const candidates: { promo: PromoKind; percent: number }[] = [];
  if (pricing.appDiscountPercent > 0) candidates.push({ promo: "app", percent: pricing.appDiscountPercent });
  if (isHappyHour(ctx.now, pricing)) candidates.push({ promo: "happy_hour", percent: pricing.happyHour.percent });
  if (isFreshSaver(ctx.expiries?.get(product.sku), ctx.now, pricing)) {
    candidates.push({ promo: "fresh_saver", percent: pricing.freshSaver.percent });
  }
  const best = candidates.sort((a, b) => b.percent - a.percent)[0];
  if (!best) return { unitCents: product.priceCents, listCents: product.priceCents, promo: null, label: null };
  return {
    unitCents: percentOff(product.priceCents, best.percent),
    listCents: product.priceCents,
    promo: best.promo,
    label: PROMO_LABELS[best.promo],
  };
}

export type QuoteLine = PricingProduct & { qty: number; unitCents: number; listCents: number; label: string | null };

export type Quote = {
  lines: QuoteLine[];
  /** Sum of menu (machine) prices. */
  listTotalCents: number;
  /** Sum of item prices after item promos. */
  itemsTotalCents: number;
  comboDiscountCents: number;
  studentDiscountCents: number;
  /** Everything saved versus menu prices. */
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  promos: string[];
};

export function quoteCart(
  items: { product: PricingProduct; qty: number }[],
  ctx: PriceContext,
  pricing: Settings["pricing"],
): Quote {
  const lines: QuoteLine[] = items.map(({ product, qty }) => {
    const price = unitPrice(product, ctx, pricing);
    return { ...product, qty, unitCents: price.unitCents, listCents: price.listCents, label: price.label };
  });

  const listTotalCents = sum(lines.map((l) => l.listCents * l.qty));
  const itemsTotalCents = sum(lines.map((l) => l.unitCents * l.qty));
  const promos = new Set(lines.map((l) => l.label).filter((l): l is string => Boolean(l)));

  // Combo: each main + drink pair takes a fixed amount off the drink.
  let comboDiscountCents = 0;
  if (pricing.combo.enabled && pricing.combo.drinkDiscountCents > 0) {
    const mains = sum(lines.filter((l) => isMain(l.category)).map((l) => l.qty));
    const drinks = lines
      .filter((l) => l.category === "drink")
      .flatMap((l) => Array.from({ length: l.qty }, () => l.unitCents))
      .sort((a, b) => b - a);
    const pairs = Math.min(mains, drinks.length);
    for (let i = 0; i < pairs; i++) comboDiscountCents += Math.min(drinks[i]!, pricing.combo.drinkDiscountCents);
    if (comboDiscountCents > 0) promos.add("Combo");
  }

  let studentDiscountCents = 0;
  if (ctx.isStudent && pricing.studentPercent > 0) {
    studentDiscountCents = roundToPound(((itemsTotalCents - comboDiscountCents) * pricing.studentPercent) / 100);
    if (studentDiscountCents > 0) promos.add("Student");
  }

  const deliveryFeeCents = ctx.deliveryFeeCents ?? 0;
  const goodsCents = Math.max(0, itemsTotalCents - comboDiscountCents - studentDiscountCents);
  return {
    lines,
    listTotalCents,
    itemsTotalCents,
    comboDiscountCents,
    studentDiscountCents,
    discountCents: listTotalCents - goodsCents,
    deliveryFeeCents,
    totalCents: goodsCents + deliveryFeeCents,
    promos: [...promos],
  };
}

export function deliveryFee(km: number, goodsCents: number, delivery: Settings["delivery"]): number {
  if (delivery.freeOverCents > 0 && goodsCents >= delivery.freeOverCents) return 0;
  return roundToPound(delivery.baseFeeCents + Math.max(0, km - 2) * delivery.perKmCents);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
