import "server-only";
import { formatEgp } from "@/lib/money";
import type { AssistantSuggestion, ProductDTO } from "@/lib/types";
import { otherFridgesWith, remainingToday, searchMenu, type AssistantContext, type MenuFilters } from "./context";

/**
 * Offline engine: understands the common asks (protein, calories, price, diet, category,
 * "fits my day") and ranks the live menu. Used when no API key is set, or Claude errors.
 */

const CATEGORY_WORDS: Record<string, string> = {
  salad: "salad",
  salads: "salad",
  wrap: "wrap",
  wraps: "wrap",
  sandwich: "sandwich",
  sandwiches: "sandwich",
  panini: "sandwich",
  bowl: "bowl",
  bowls: "bowl",
  warm: "bowl",
  hot: "bowl",
  dessert: "dessert",
  desserts: "dessert",
  sweet: "dessert",
  drink: "drink",
  drinks: "drink",
  smoothie: "drink",
  juice: "drink",
  snack: "snack",
};

const ALLERGEN_WORDS: Record<string, string> = {
  nut: "peanuts",
  nuts: "peanuts",
  peanut: "peanuts",
  dairy: "dairy",
  lactose: "dairy",
  gluten: "gluten",
  egg: "egg",
  eggs: "egg",
  fish: "fish",
  seafood: "shellfish",
  shellfish: "shellfish",
  soy: "soy",
  sesame: "sesame",
};

export function parseIntent(message: string): MenuFilters & { fitMyDay: boolean; cheapest: boolean } {
  const text = message.toLowerCase();
  const f: MenuFilters & { fitMyDay: boolean; cheapest: boolean } = { fitMyDay: false, cheapest: false, tags: [], categories: [], excludeAllergens: [] };

  // \b after each number stops backtracking ("under 450 kcal" must never read as "under 45").
  const protein = text.match(/\b(\d{1,3})\s*g(?:rams?)?\s*(?:of\s*)?protein/) ?? text.match(/protein\s*(?:of\s*)?(?:at least\s*)?(\d{1,3})\s*g\b/);
  if (protein) f.minProteinG = Number(protein[1]);
  else if (/high[\s-]?protein|protein|muscle|gym|workout|bulk/.test(text)) f.minProteinG = 20;

  const kcal = text.match(/(?:under|below|less than|max|<)\s*(\d{2,4})\s*(?:k?cal|calories)\b/) ?? text.match(/\b(\d{2,4})\s*(?:k?cal|calories)\s*(?:or less|max)/);
  if (kcal) f.maxKcal = Number(kcal[1]);
  else if (/\blight\b|\blow[\s-]?cal|diet|cut(ting)?\b/.test(text)) f.maxKcal = 400;

  const price =
    text.match(/(?:under|below|less than|max|<|budget)\s*(?:egp|le|£)?\s*(\d{2,4})\b(?!\s*(?:k?cal|calories|g\b|grams?\b))/) ??
    text.match(/\b(\d{2,4})\s*(?:egp|le|pounds|gneh|geneh)\b/);
  if (price) f.maxPriceEgp = Number(price[1]);
  if (/cheap|budget|affordable|save money/.test(text)) f.cheapest = true;

  if (/low[\s-]?carb|keto/.test(text)) f.maxCarbsG = 15;
  if (/vegetarian|veggie|no meat/.test(text)) f.tags!.push("vegetarian");
  if (/\bvegan\b|plant[\s-]?based/.test(text)) f.tags!.push("vegan");
  if (/pescatarian|seafood|fish/.test(text) && !/no (fish|seafood)/.test(text)) f.tags!.push("pescatarian");
  if (/spicy|hot sauce|chipotle|sriracha/.test(text)) f.tags!.push("spicy");

  for (const [word, category] of Object.entries(CATEGORY_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text) && !f.categories!.includes(category)) f.categories!.push(category);
  }
  for (const m of text.matchAll(/(?:no|without|free of|allergic to|avoid)\s+(\w+)/g)) {
    const allergen = ALLERGEN_WORDS[m[1] ?? ""];
    if (allergen) f.excludeAllergens!.push(allergen);
  }
  for (const m of text.matchAll(/(\w+)[\s-]free/g)) {
    const allergen = ALLERGEN_WORDS[m[1] ?? ""];
    if (allergen) f.excludeAllergens!.push(allergen);
  }
  f.fitMyDay = /my (macros|goal|day|target)|fit|left today|what should i (eat|get|have)|recommend|suggest|hungry/.test(text);
  return f;
}

export function rulesEngine(ctx: AssistantContext, message: string): { reply: string; suggestions: AssistantSuggestion[] } {
  const intent = parseIntent(message);
  const remaining = remainingToday(ctx);
  if (intent.fitMyDay && remaining) {
    if (intent.minProteinG === undefined && remaining.proteinG > 15) intent.minProteinG = Math.min(20, remaining.proteinG);
    if (intent.maxKcal === undefined) intent.maxKcal = Math.max(250, remaining.kcal);
  }

  let picks = searchMenu(ctx, intent);
  let relaxed = false;
  if (picks.length === 0) {
    // Relax the strictest numeric limits once rather than answering "nothing".
    relaxed = true;
    picks = searchMenu(ctx, { ...intent, minProteinG: intent.minProteinG ? intent.minProteinG * 0.75 : undefined, maxKcal: intent.maxKcal ? intent.maxKcal * 1.2 : undefined, maxPriceEgp: intent.maxPriceEgp ? intent.maxPriceEgp * 1.15 : undefined });
  }

  const score = (p: ProductDTO) => {
    let s = 0;
    if (intent.minProteinG !== undefined) s += (p.nutrition.proteinG / Math.max(1, p.nutrition.kcal)) * 1000;
    if (intent.maxKcal !== undefined) s -= p.nutrition.kcal / 50;
    if (intent.cheapest || intent.maxPriceEgp !== undefined) s -= p.appPriceCents / 2000;
    if (p.promo?.kind === "fresh_saver") s += 3;
    if (p.nutrition.source === "label") s += 1;
    return s;
  };
  picks = [...picks].sort((a, b) => score(b) - score(a)).slice(0, 3);

  const where = ctx.machine?.name ?? "your fridge";
  if (picks.length === 0) {
    // Nothing here — look at other fridges for anything matching.
    const elsewhere = searchMenu({ ...ctx }, { ...intent, includeOutOfStock: true })
      .map((p) => ({ product: p, alt: otherFridgesWith(ctx, p.sku)[0] }))
      .filter((x) => x.alt)
      .slice(0, 2);
    if (elsewhere.length) {
      return {
        reply: `Nothing at ${where} matches that right now, but these are in stock nearby:`,
        suggestions: elsewhere.map(({ product, alt }) => ({ product, reason: describe(product, intent), alternative: alt ?? null })),
      };
    }
    return {
      reply: `I couldn't find anything matching that at ${where}. Try loosening a filter — or tell me what you're in the mood for.`,
      suggestions: [],
    };
  }

  const bits: string[] = [];
  if (intent.minProteinG) bits.push(`${Math.round(intent.minProteinG)} g+ protein`);
  if (intent.maxKcal) bits.push(`under ${Math.round(intent.maxKcal)} kcal`);
  if (intent.maxPriceEgp) bits.push(`under ${formatEgp(intent.maxPriceEgp * 100)}`);
  if (intent.tags?.length) bits.push(intent.tags.join(", "));
  const lead =
    intent.fitMyDay && remaining
      ? `You've got ${remaining.kcal.toLocaleString()} kcal and ${remaining.proteinG} g protein left today. Best fits at ${where}:`
      : `${relaxed ? "Closest matches" : "Good calls"} at ${where}${bits.length ? ` (${bits.join(" · ")})` : ""}:`;

  return { reply: lead, suggestions: picks.map((p) => ({ product: p, reason: describe(p, intent), alternative: null })) };
}

function describe(p: ProductDTO, intent: MenuFilters): string {
  const parts = [`${Math.round(p.nutrition.proteinG)} g protein`, `${p.nutrition.kcal} kcal`];
  if (intent.maxCarbsG !== undefined) parts.push(`${p.nutrition.carbsG} g carbs`);
  parts.push(formatEgp(p.appPriceCents));
  if (p.promo?.kind === "fresh_saver") parts.push("fresh-saver deal");
  return parts.join(" · ");
}
