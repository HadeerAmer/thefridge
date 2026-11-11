import type { Category, Nutrition } from "./types";

export const CATEGORIES: { id: Category; label: string; emoji: string }[] = [
  { id: "salad", label: "Salads", emoji: "🥗" },
  { id: "bowl", label: "Warm bowls", emoji: "🍜" },
  { id: "wrap", label: "Wraps", emoji: "🌯" },
  { id: "sandwich", label: "Sandwiches", emoji: "🥪" },
  { id: "dessert", label: "Desserts", emoji: "🍰" },
  { id: "drink", label: "Drinks", emoji: "🥤" },
  { id: "snack", label: "Snacks", emoji: "🍪" },
];

export const TAG_LABELS: Record<string, string> = {
  "high-protein": "High protein",
  "low-carb": "Low carb",
  light: "Under 400 kcal",
  vegetarian: "Vegetarian",
  pescatarian: "Pescatarian",
  vegan: "Vegan",
  spicy: "Spicy",
  "gluten-free": "Gluten-free",
  "dairy-free": "Dairy-free",
};

/** Filters shown as chips on the menu (the deck's diet filters). */
export const FILTER_TAGS = ["high-protein", "low-carb", "light", "vegetarian", "pescatarian", "spicy"] as const;

export const ALLERGEN_LABELS: Record<string, string> = {
  gluten: "Gluten",
  dairy: "Dairy",
  egg: "Egg",
  fish: "Fish",
  shellfish: "Shellfish",
  peanuts: "Peanuts",
  "tree-nuts": "Tree nuts",
  soy: "Soy",
  sesame: "Sesame",
  mustard: "Mustard",
};

/** Macro-based tags, derived so they always match the nutrition numbers. */
export function derivedTags(n: Nutrition): string[] {
  const tags: string[] = [];
  if (n.proteinG >= 20) tags.push("high-protein");
  if (n.carbsG <= 15) tags.push("low-carb");
  if (n.kcal <= 400) tags.push("light");
  return tags;
}
