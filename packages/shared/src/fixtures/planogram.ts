import { MACHINE_BY_ID } from "./machines";
import { PRODUCTS, PRODUCT_BY_SKU } from "./products";

/**
 * Builds the initial shelf layout ("planogram") of a machine: 5 shelves (A–E) × 6 slots.
 * Deterministic per machine id, so the simulator and the cloud seed agree on day one.
 */

export type PlanogramSlot = {
  code: string;
  sku: string | null;
  name: string | null;
  priceCents: number | null;
  qty: number;
  capacity: number;
  expiresAt: string | null;
};

export const SHELVES = ["A", "B", "C", "D", "E"] as const;
export const SLOTS_PER_SHELF = 6;
export const SLOT_CAPACITY = 6;

const HOUR = 60 * 60 * 1000;

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small seeded PRNG (mulberry32). */
export function seededRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildPlanogram(machineId: string, now: Date = new Date()): PlanogramSlot[] {
  const machine = MACHINE_BY_ID.get(machineId);
  const rand = seededRandom(hashString(machineId));
  const closed = machine?.isSeasonal ?? false;
  const scenario = machine?.scenario ?? {};

  // Salads and bowls get two slots each (best sellers); everything else one slot.
  const lineup: string[] = [];
  for (const product of PRODUCTS) {
    lineup.push(product.sku);
    if (product.category === "salad" && ["SAL-CAESAR", "SAL-TACO", "SAL-CRAB", "SAL-BURGER"].includes(product.sku)) {
      lineup.push(product.sku);
    }
  }
  const total = SHELVES.length * SLOTS_PER_SHELF;
  const skus = lineup.slice(0, total);

  const slots: PlanogramSlot[] = [];
  let index = 0;
  for (const shelf of SHELVES) {
    for (let n = 1; n <= SLOTS_PER_SHELF; n++) {
      const code = `${shelf}${n}`;
      const sku = skus[index++] ?? null;
      const product = sku ? PRODUCT_BY_SKU.get(sku) : undefined;
      if (!product) {
        slots.push({ code, sku: null, name: null, priceCents: null, qty: 0, capacity: SLOT_CAPACITY, expiresAt: null });
        continue;
      }

      let qty = closed ? 0 : 1 + Math.floor(rand() * SLOT_CAPACITY);
      if (scenario.soldOut?.includes(product.sku)) qty = 0;
      if (scenario.lowStock?.includes(product.sku)) qty = 1;

      // Made fresh daily: most items expire in 1–2 days, a few later today.
      let expiresInHours = 20 + Math.floor(rand() * 30);
      if (scenario.expiringSoon?.includes(product.sku)) expiresInHours = 3 + Math.floor(rand() * 3);
      if (product.category === "drink" || product.category === "snack") expiresInHours += 72;

      slots.push({
        code,
        sku: product.sku,
        name: product.shortName,
        priceCents: product.priceCents,
        qty,
        capacity: SLOT_CAPACITY,
        expiresAt: qty > 0 ? new Date(now.getTime() + expiresInHours * HOUR).toISOString() : null,
      });
    }
  }
  return slots;
}

/** Collapses slots into per-SKU stock levels. */
export function summarizePlanogram(slots: PlanogramSlot[]) {
  const bySku = new Map<string, { sku: string; onHand: number; slots: string[]; nearestExpiry: string | null }>();
  for (const slot of slots) {
    if (!slot.sku) continue;
    const entry = bySku.get(slot.sku) ?? { sku: slot.sku, onHand: 0, slots: [], nearestExpiry: null };
    entry.onHand += slot.qty;
    entry.slots.push(slot.code);
    if (slot.qty > 0 && slot.expiresAt && (!entry.nearestExpiry || slot.expiresAt < entry.nearestExpiry)) {
      entry.nearestExpiry = slot.expiresAt;
    }
    bySku.set(slot.sku, entry);
  }
  return [...bySku.values()];
}
