import "server-only";
import { distanceKm, type LatLng } from "@/lib/geo";
import type { MachineDTO, MeDTO, ProductDTO, TodayDTO } from "@/lib/types";
import { getMenu } from "../catalog";
import { listMachines, toMachineDTO } from "../machines/service";
import { today as todayLog } from "../nutrition/service";
import { getMe } from "../users";

/** Everything the assistant may look at for one question. Read-only. */
export type AssistantContext = {
  machine: MachineDTO | null;
  products: ProductDTO[];
  /** Other selling fridges with per-SKU availability, nearest first when we know where the user is. */
  fridges: { machine: MachineDTO; available: Map<string, number> }[];
  me: MeDTO | null;
  today: TodayDTO | null;
};

export async function buildContext(input: { userId: string | null; machineId: string | null; near: LatLng | null }): Promise<AssistantContext> {
  const [menu, machines, me] = await Promise.all([
    getMenu(input.machineId),
    listMachines({ near: input.near, withStock: true }),
    input.userId ? getMe(input.userId) : null,
  ]);
  const today = me && input.userId ? await todayLog(input.userId, me.targets) : null;

  const fridges = machines
    .map((m) => ({
      machine: toMachineDTO(m),
      available: new Map((m.stock ?? []).map((s) => [s.sku, Math.max(0, s.onHand - s.held)])),
    }))
    .filter((f) => f.machine.isSelling);
  if (input.near && fridges.every((f) => f.machine.distanceKm === null)) {
    for (const f of fridges) f.machine.distanceKm = distanceKm(input.near, f.machine);
  }
  return { machine: menu.machine, products: menu.products, fridges, me, today };
}

export type MenuFilters = {
  query?: string;
  maxPriceEgp?: number;
  minProteinG?: number;
  maxKcal?: number;
  maxCarbsG?: number;
  tags?: string[];
  categories?: string[];
  excludeAllergens?: string[];
  includeOutOfStock?: boolean;
};

/** Menu search shared by both engines (Claude's `search_menu` tool and the rules engine). */
export function searchMenu(ctx: AssistantContext, f: MenuFilters): ProductDTO[] {
  const words = (f.query ?? "").toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const blocked = new Set([...(f.excludeAllergens ?? []), ...(ctx.me?.profile.allergens ?? [])]);
  return ctx.products.filter((p) => {
    if (!f.includeOutOfStock && (p.stock?.available ?? 0) === 0) return false;
    if (f.maxPriceEgp !== undefined && p.appPriceCents > f.maxPriceEgp * 100) return false;
    if (f.minProteinG !== undefined && p.nutrition.proteinG < f.minProteinG) return false;
    if (f.maxKcal !== undefined && p.nutrition.kcal > f.maxKcal) return false;
    if (f.maxCarbsG !== undefined && p.nutrition.carbsG > f.maxCarbsG) return false;
    if (f.tags?.length && !f.tags.every((t) => p.tags.includes(t))) return false;
    if (f.categories?.length && !f.categories.includes(p.category)) return false;
    if (p.allergens.some((a) => blocked.has(a))) return false;
    if (words.length) {
      const haystack = `${p.name} ${p.description} ${p.ingredients.join(" ")} ${p.category}`.toLowerCase();
      if (!words.some((w) => haystack.includes(w))) return false;
    }
    return true;
  });
}

/** Compact view of a product for the model (and for logs). */
export function productFacts(p: ProductDTO) {
  return {
    sku: p.sku,
    name: p.name,
    category: p.category,
    priceEgp: p.appPriceCents / 100,
    machinePriceEgp: p.priceCents / 100,
    promo: p.promo?.label ?? null,
    kcal: p.nutrition.kcal,
    proteinG: p.nutrition.proteinG,
    carbsG: p.nutrition.carbsG,
    fatG: p.nutrition.fatG,
    macrosFrom: p.nutrition.source === "label" ? "The Fridge label" : "estimate",
    tags: p.tags,
    allergens: p.allergens,
    availableHere: p.stock?.available ?? 0,
  };
}

export function remainingToday(ctx: AssistantContext) {
  if (!ctx.today) return null;
  const { targets, consumed } = ctx.today;
  return {
    kcal: Math.max(0, targets.kcal - consumed.kcal),
    proteinG: Math.max(0, Math.round(targets.proteinG - consumed.proteinG)),
    carbsG: Math.max(0, Math.round(targets.carbsG - consumed.carbsG)),
    fatG: Math.max(0, Math.round(targets.fatG - consumed.fatG)),
  };
}

export function otherFridgesWith(ctx: AssistantContext, sku: string) {
  return ctx.fridges
    .filter((f) => f.machine.id !== ctx.machine?.id && (f.available.get(sku) ?? 0) > 0)
    .map((f) => ({
      machineId: f.machine.id,
      machineName: f.machine.name,
      available: f.available.get(sku) ?? 0,
      distanceKm: f.machine.distanceKm === null ? null : Math.round(f.machine.distanceKm * 10) / 10,
    }));
}
