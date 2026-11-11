import "server-only";
import { z } from "zod";
import type { AssistantSuggestion } from "@/lib/types";
import { otherFridgesWith, productFacts, remainingToday, searchMenu, type AssistantContext } from "./context";

/**
 * Provider-neutral assistant definition: one instruction prompt and one set of read-only tools.
 * Each LLM engine (OpenAI, Claude) maps these to its own SDK types.
 */

export const ASSISTANT_INSTRUCTIONS = `You are the in-app food assistant of The Fridge — smart fridges in Egypt selling fresh salads, warm bowls, wraps, paninis, desserts and drinks, made fresh every day. Brand line: "Always a good cal(l)".

Help the member choose what to get from their selected fridge. Use the tools to look things up: search_menu for live items, prices and macros at their fridge; get_my_day for their goals, what they have eaten today and their allergies; find_in_other_fridges when something is sold out where they are. Recommend at most three items, and show them by calling show_products with each item's sku and a short reason — the app turns those into cards with a reserve button.

Only recommend items that search_menu returned, and quote prices and macros exactly as the tools give them (prices are in EGP). Never suggest something that contains an allergen on the member's list. If nothing fits, say so plainly and offer the closest alternative.

Keep the written reply to one to three short, friendly sentences; the cards carry the details. Answer general nutrition questions briefly and steer back to the menu.`;

export type ToolDefinition = {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
};

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "search_menu",
    description:
      "Search what is in stock at the member's selected fridge. Every filter is optional; combine them. Returns items with app price (EGP), macros, tags, allergens and units available. The member's own allergens are always excluded.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to match in name, description or ingredients, e.g. 'chicken' or 'mango'." },
        maxPriceEgp: { type: "number" },
        minProteinG: { type: "number" },
        maxKcal: { type: "number" },
        maxCarbsG: { type: "number" },
        tags: {
          type: "array",
          items: { type: "string", enum: ["high-protein", "low-carb", "light", "vegetarian", "pescatarian", "vegan", "spicy", "gluten-free", "dairy-free"] },
        },
        categories: { type: "array", items: { type: "string", enum: ["salad", "bowl", "wrap", "sandwich", "dessert", "drink", "snack"] } },
        excludeAllergens: { type: "array", items: { type: "string" } },
        includeOutOfStock: { type: "boolean", description: "Include sold-out items (to then check other fridges)." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_my_day",
    description:
      "The member's daily targets, what they have eaten today, what is left, their goal, diet preferences and allergies. Returns signedIn=false for guests.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "find_in_other_fridges",
    description: "Which other fridges have this item in stock, with distance when known.",
    parameters: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"], additionalProperties: false },
  },
  {
    name: "show_products",
    description: "Show up to three recommended items to the member as cards. Call this once with your final picks.",
    parameters: {
      type: "object",
      properties: {
        picks: {
          type: "array",
          maxItems: 3,
          items: {
            type: "object",
            properties: { sku: { type: "string" }, reason: { type: "string", description: "Why it fits, under 15 words." } },
            required: ["sku", "reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["picks"],
      additionalProperties: false,
    },
  },
];

const FiltersSchema = z.object({
  query: z.string().max(80).optional(),
  maxPriceEgp: z.number().positive().optional(),
  minProteinG: z.number().min(0).optional(),
  maxKcal: z.number().positive().optional(),
  maxCarbsG: z.number().min(0).optional(),
  tags: z.array(z.string()).optional(),
  categories: z.array(z.string()).optional(),
  excludeAllergens: z.array(z.string()).optional(),
  includeOutOfStock: z.boolean().optional(),
});
const SkuSchema = z.object({ sku: z.string() });
const PicksSchema = z.object({ picks: z.array(z.object({ sku: z.string(), reason: z.string().max(200) })).max(3) });
export type Picks = z.infer<typeof PicksSchema>["picks"];

/**
 * Runs one tool call. Model-supplied arguments are untrusted: every input is validated with zod
 * (a ZodError becomes an error tool result the model can recover from).
 */
export function runTool(ctx: AssistantContext, name: string, input: unknown, onPicks: (picks: Picks) => void): unknown {
  switch (name) {
    case "search_menu": {
      const items = searchMenu(ctx, FiltersSchema.parse(input ?? {})).slice(0, 12).map(productFacts);
      return { fridge: ctx.machine?.name ?? null, count: items.length, items };
    }
    case "get_my_day": {
      if (!ctx.me) return { signedIn: false };
      return {
        signedIn: true,
        name: ctx.me.name.split(" ")[0],
        goal: ctx.me.profile.goal,
        dietPrefs: ctx.me.profile.dietPrefs,
        allergies: ctx.me.profile.allergens,
        targets: ctx.me.targets,
        eatenToday: ctx.today?.consumed ?? null,
        leftToday: remainingToday(ctx),
      };
    }
    case "find_in_other_fridges":
      return { fridges: otherFridgesWith(ctx, SkuSchema.parse(input).sku) };
    case "show_products": {
      const { picks } = PicksSchema.parse(input);
      onPicks(picks);
      return { shown: picks.length };
    }
    default:
      throw new Error(`Unknown tool ${name}`);
  }
}

/** Turns the model's picks into product cards (sold out here → nearest fridge that has it). */
export function picksToSuggestions(ctx: AssistantContext, picks: Picks): AssistantSuggestion[] {
  const bySku = new Map(ctx.products.map((p) => [p.sku, p]));
  return picks.flatMap(({ sku, reason }) => {
    const product = bySku.get(sku);
    if (!product) return [];
    const alternative = (product.stock?.available ?? 0) === 0 ? (otherFridgesWith(ctx, sku)[0] ?? null) : null;
    return [{ product, reason, alternative }];
  });
}

/** Volatile per-request context goes in the user turn, keeping the instructions stable (cacheable). */
export function contextLine(ctx: AssistantContext) {
  return `[Selected fridge: ${ctx.machine ? `${ctx.machine.name} (${ctx.machine.area})` : "none"}]`;
}

export type ChatTurn = { role: "user" | "assistant"; content: string };
export const MAX_TOOL_ROUNDS = 5;
