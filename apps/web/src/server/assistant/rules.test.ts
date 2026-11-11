import { describe, expect, it } from "vitest";
import { parseIntent } from "./rules";

describe("parseIntent", () => {
  it("reads calories without mistaking them for a price", () => {
    const f = parseIntent("something vegetarian under 450 kcal");
    expect(f.maxKcal).toBe(450);
    expect(f.maxPriceEgp).toBeUndefined();
    expect(f.tags).toContain("vegetarian");
  });

  it("reads protein and price together", () => {
    const f = parseIntent("30 g protein under EGP 160");
    expect(f.minProteinG).toBe(30);
    expect(f.maxPriceEgp).toBe(160);
  });

  it("understands diet words, categories and allergen exclusions", () => {
    const f = parseIntent("low carb salad, no nuts please");
    expect(f.maxCarbsG).toBe(15);
    expect(f.categories).toContain("salad");
    expect(f.excludeAllergens).toContain("peanuts");
  });

  it("detects 'fit my day' questions", () => {
    expect(parseIntent("What fits my macros today?").fitMyDay).toBe(true);
  });
});
