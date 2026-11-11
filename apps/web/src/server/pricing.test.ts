import { describe, expect, it } from "vitest";
import { deliveryFee, isHappyHour, quoteCart, unitPrice } from "./pricing";
import { SettingsSchema } from "./settings";

const settings = SettingsSchema.parse({});
const pricing = settings.pricing;
// 08:00 Cairo (UTC+2 in November) — outside happy hour.
const MORNING = new Date("2026-11-02T06:00:00Z");
// 16:30 Cairo — inside the default 15:00–17:00 happy hour.
const AFTERNOON = new Date("2026-11-02T14:30:00Z");

const caesar = { productId: "p1", sku: "SAL-CAESAR", name: "Chicken Caesar Salad", category: "salad", priceCents: 17000 };
const lemonade = { productId: "p2", sku: "DRK-LEMONADE", name: "Tropical Lemonade", category: "drink", priceCents: 9000 };

describe("unitPrice", () => {
  it("applies the app-only discount, rounded to whole pounds", () => {
    const price = unitPrice(caesar, { now: MORNING }, pricing);
    expect(price.unitCents).toBe(16200); // 170 × 0.95 = 161.5 → 162
    expect(price.label).toBe("App price");
  });

  it("uses the best promo, never stacking item promos", () => {
    expect(isHappyHour(AFTERNOON, pricing)).toBe(true);
    const price = unitPrice(caesar, { now: AFTERNOON }, pricing);
    expect(price.promo).toBe("happy_hour");
    expect(price.unitCents).toBe(14500); // 15% beats 5%
  });

  it("marks down items close to expiry (fresh-saver)", () => {
    const expiries = new Map([["SAL-CAESAR", new Date(MORNING.getTime() + 3 * 3_600_000)]]);
    const price = unitPrice(caesar, { now: MORNING, expiries }, pricing);
    expect(price.promo).toBe("fresh_saver");
    expect(price.unitCents).toBe(11900); // 30% off
  });

  it("ignores expiries outside the fresh-saver window", () => {
    const expiries = new Map([["SAL-CAESAR", new Date(MORNING.getTime() + 30 * 3_600_000)]]);
    expect(unitPrice(caesar, { now: MORNING, expiries }, pricing).promo).toBe("app");
  });
});

describe("quoteCart", () => {
  it("gives the combo discount for a main + drink", () => {
    const quote = quoteCart([{ product: caesar, qty: 1 }, { product: lemonade, qty: 1 }], { now: MORNING }, pricing);
    expect(quote.comboDiscountCents).toBe(2000);
    expect(quote.totalCents).toBe(16200 + 8600 - 2000);
    expect(quote.promos).toContain("Combo");
  });

  it("pairs one drink per main", () => {
    const quote = quoteCart([{ product: caesar, qty: 1 }, { product: lemonade, qty: 3 }], { now: MORNING }, pricing);
    expect(quote.comboDiscountCents).toBe(2000);
  });

  it("applies the student discount after the combo and reports total savings", () => {
    const quote = quoteCart([{ product: caesar, qty: 2 }], { now: MORNING, isStudent: true }, pricing);
    expect(quote.studentDiscountCents).toBe(3200); // 10% of 324 = 32.4 → 32
    expect(quote.totalCents).toBe(32400 - 3200);
    expect(quote.discountCents).toBe(34000 - quote.totalCents);
  });

  it("adds the delivery fee to the total", () => {
    const quote = quoteCart([{ product: caesar, qty: 1 }], { now: MORNING, deliveryFeeCents: 2500 }, pricing);
    expect(quote.totalCents).toBe(16200 + 2500);
  });
});

describe("deliveryFee", () => {
  it("charges a base fee plus a per-km rate beyond 2 km", () => {
    expect(deliveryFee(1, 10000, settings.delivery)).toBe(2500);
    expect(deliveryFee(5, 10000, settings.delivery)).toBe(2500 + 3 * 400);
  });

  it("is free above the threshold", () => {
    expect(deliveryFee(8, 60000, settings.delivery)).toBe(0);
  });
});
