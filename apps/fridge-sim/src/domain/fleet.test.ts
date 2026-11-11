import { describe, expect, it } from "vitest";
import type { MachineEvent } from "@thefridge/shared/contracts";
import { Fleet } from "./fleet";
import { DomainError } from "./errors";

function setup() {
  const fleet = new Fleet(Fleet.fresh(new Date("2026-11-02T08:00:00Z")), () => {});
  const events: MachineEvent[] = [];
  fleet.on("machineEvent", (e) => events.push(e));
  return { fleet, events };
}

const available = (fleet: Fleet, machineId: string, sku: string) =>
  fleet.inventory(machineId).items.find((i) => i.sku === sku)?.available ?? 0;

describe("Fleet holds", () => {
  it("holds units so nobody else can take them", () => {
    const { fleet, events } = setup();
    const before = available(fleet, "cbp-zayed", "SAL-CRAB");
    fleet.createHold("cbp-zayed", { ref: "order-1", items: [{ sku: "SAL-CRAB", qty: 1 }], ttlSeconds: 900 });
    expect(available(fleet, "cbp-zayed", "SAL-CRAB")).toBe(before - 1);
    expect(events.some((e) => e.type === "stock.changed")).toBe(true);
  });

  it("is idempotent per reference", () => {
    const { fleet } = setup();
    const a = fleet.createHold("cbp-zayed", { ref: "order-1", items: [{ sku: "SAL-CRAB", qty: 1 }], ttlSeconds: 900 });
    const b = fleet.createHold("cbp-zayed", { ref: "order-1", items: [{ sku: "SAL-CRAB", qty: 1 }], ttlSeconds: 900 });
    expect(b.id).toBe(a.id);
  });

  it("refuses more than is available", () => {
    const { fleet } = setup();
    expect(() => fleet.createHold("miu-obour", { ref: "x", items: [{ sku: "SAL-CAESAR", qty: 1 }], ttlSeconds: 900 })).toThrow(DomainError);
  });

  it("expires holds and announces it", () => {
    const { fleet, events } = setup();
    const before = available(fleet, "cbp-zayed", "SAL-CRAB");
    const hold = fleet.createHold("cbp-zayed", { ref: "order-2", items: [{ sku: "SAL-CRAB", qty: 1 }], ttlSeconds: 60 });
    fleet.expireHolds(Date.parse(hold.expiresAt) + 1);
    expect(available(fleet, "cbp-zayed", "SAL-CRAB")).toBe(before);
    expect(events.some((e) => e.type === "hold.expired" && e.data.ref === "order-2")).toBe(true);
  });
});

describe("Fleet vending", () => {
  it("dispenses a held order once", () => {
    const { fleet, events } = setup();
    const onHand = fleet.inventory("cbp-zayed").items.find((i) => i.sku === "SAL-CRAB")!.onHand;
    const hold = fleet.createHold("cbp-zayed", { ref: "order-3", items: [{ sku: "SAL-CRAB", qty: 1 }], ttlSeconds: 900 });
    fleet.vendHold("cbp-zayed", hold.id, { channel: "app" });
    expect(fleet.inventory("cbp-zayed").items.find((i) => i.sku === "SAL-CRAB")!.onHand).toBe(onHand - 1);
    expect(events.some((e) => e.type === "vend.completed" && e.data.ref === "order-3")).toBe(true);
    expect(() => fleet.vendHold("cbp-zayed", hold.id, { channel: "app" })).toThrow(/consumed/);
  });

  it("won't sell the last unit to a walk-up buyer if it is reserved", () => {
    const { fleet } = setup();
    // Chicken Taco is the low-stock scenario at Capital Business Park: one unit in total.
    const slot = fleet.machine("cbp-zayed").slots.find((s) => s.sku === "SAL-TACO" && s.qty > 0)!;
    const totalAvailable = available(fleet, "cbp-zayed", "SAL-TACO");
    fleet.createHold("cbp-zayed", { ref: "order-4", items: [{ sku: "SAL-TACO", qty: totalAvailable }], ttlSeconds: 900 });
    expect(() => fleet.walkUp("cbp-zayed", slot.code, "card")).toThrow(/reserved/);
  });

  it("pauses sales when the cabinet is too warm", () => {
    const { fleet } = setup();
    fleet.update("cbp-zayed", { temperatureC: 11 });
    expect(fleet.machine("cbp-zayed").salesLocked).toBe(true);
    expect(() => fleet.createHold("cbp-zayed", { ref: "x", items: [{ sku: "SAL-CRAB", qty: 1 }], ttlSeconds: 900 })).toThrow(/paused/);
  });
});
