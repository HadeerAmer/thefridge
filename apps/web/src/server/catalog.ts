import "server-only";
import { derivedTags } from "@/lib/catalog-meta";
import type { MachineDTO, ProductAvailability, ProductDTO, StockAtMachine } from "@/lib/types";
import { Machine, Product, type ProductDoc } from "./db/models";
import { listMachines, toMachineDTO, type MachineLean } from "./machines/service";
import { unitPrice } from "./pricing";
import { getSettings, type Settings } from "./settings";
import type { LatLng } from "@/lib/geo";

/** Menu + live availability at a fridge, priced for the app. */

type ProductLean = ProductDoc;

export function toProductDTO(
  p: ProductLean,
  options: { machine?: MachineLean | null; settings: Settings; now?: Date },
): ProductDTO {
  const now = options.now ?? new Date();
  const stockEntry = options.machine?.stock?.find((s) => s.sku === p.sku);
  const stock: StockAtMachine | null = options.machine
    ? {
        machineId: options.machine._id,
        onHand: stockEntry?.onHand ?? 0,
        held: stockEntry?.held ?? 0,
        available: Math.max(0, (stockEntry?.onHand ?? 0) - (stockEntry?.held ?? 0)),
        nearestExpiry: stockEntry?.nearestExpiry ? new Date(stockEntry.nearestExpiry).toISOString() : null,
      }
    : null;

  const expiries = new Map<string, Date | null>([[p.sku, stockEntry?.nearestExpiry ? new Date(stockEntry.nearestExpiry) : null]]);
  const price = unitPrice({ sku: p.sku, priceCents: p.priceCents }, { now, expiries }, options.settings.pricing);
  const nutrition = {
    kcal: p.nutrition.kcal,
    proteinG: p.nutrition.proteinG,
    carbsG: p.nutrition.carbsG,
    fatG: p.nutrition.fatG,
  };

  return {
    id: String(p._id),
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    shortName: p.shortName,
    category: p.category,
    description: p.description,
    ingredients: p.ingredients ?? [],
    allergens: p.allergens ?? [],
    tags: [...new Set([...derivedTags(nutrition), ...(p.tags ?? [])])],
    priceCents: p.priceCents,
    appPriceCents: price.unitCents,
    promo: price.promo ? { kind: price.promo, label: price.label! } : null,
    nutrition: { ...nutrition, weightG: p.nutrition.weightG, source: p.nutrition.source },
    art: { layers: p.art?.layers ?? [], accent: p.art?.accent ?? "#1F5A34" },
    isNewArrival: Boolean(p.isNewArrival),
    stock,
  };
}

export async function getMenu(machineId?: string | null): Promise<{ products: ProductDTO[]; machine: MachineDTO | null }> {
  const [settings, products, machine] = await Promise.all([
    getSettings(),
    Product.find({ isActive: true }).sort({ sortOrder: 1 }).lean<ProductLean[]>(),
    machineId ? Machine.findById(machineId).lean<MachineLean>() : null,
  ]);
  const now = new Date();
  return {
    products: products.map((p) => toProductDTO(p, { machine, settings, now })),
    machine: machine ? toMachineDTO(machine) : null,
  };
}

export async function getProduct(
  slug: string,
  options: { machineId?: string | null; near?: LatLng | null } = {},
): Promise<{ product: ProductDTO; availability: ProductAvailability[] } | null> {
  const [settings, product] = await Promise.all([getSettings(), Product.findOne({ slug, isActive: true }).lean<ProductLean>()]);
  if (!product) return null;

  const machines = await listMachines({ near: options.near ?? null, withStock: true });
  const selected = machines.find((m) => m._id === options.machineId) ?? null;
  const availability: ProductAvailability[] = machines
    .filter((m) => !m.isSeasonal)
    .map((m) => {
      const entry = m.stock?.find((s) => s.sku === product.sku);
      return {
        machine: toMachineDTO(m),
        available: Math.max(0, (entry?.onHand ?? 0) - (entry?.held ?? 0)),
        nearestExpiry: entry?.nearestExpiry ? new Date(entry.nearestExpiry).toISOString() : null,
      };
    })
    .sort((a, b) => Number(b.available > 0) - Number(a.available > 0) || (a.machine.distanceKm ?? 0) - (b.machine.distanceKm ?? 0));

  return { product: toProductDTO(product, { machine: selected, settings }), availability };
}

/** Products by SKU, for pricing and validation. */
export async function productsBySku(skus: string[]) {
  const docs = await Product.find({ sku: { $in: skus }, isActive: true }).lean<ProductLean[]>();
  return new Map(docs.map((d) => [d.sku, d]));
}
