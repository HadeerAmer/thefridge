import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import {
  CreateHoldRequestSchema,
  MachineErrorCode,
  type CreateHoldRequest,
  type Hold,
  type HoldItem,
  type Inventory,
  type MachineEvent,
  type MachineEventOf,
  type MachineEventType,
  type MachineStatus,
  type MachineSummary,
  type StockLevel,
  type VendResult,
} from "@thefridge/shared/contracts";
import { MACHINES, buildPlanogram } from "@thefridge/shared/fixtures";
import { DomainError, notFound } from "./errors";
import {
  SAFE_MAX_TEMPERATURE_C,
  type FleetState,
  type HoldState,
  type MachineState,
  type SlotState,
  type VendRecord,
} from "./types";

const HOUR_MS = 60 * 60 * 1000;
const RESTOCK_SHELF_LIFE_HOURS = 36;
const MAX_VEND_HISTORY = 200;
const MAX_CLOSED_HOLDS_PER_MACHINE = 50;

type FleetEvents = {
  /** Events that must reach the cloud (delivered as signed webhooks). */
  machineEvent: [event: MachineEvent];
  /** Something about this machine changed — the touchscreen UI re-renders. */
  changed: [machineId: string];
};

export type MachinePatch = {
  status?: MachineStatus;
  temperatureC?: number;
  notice?: string | null;
};

/**
 * All simulated machines and the rules a real vending controller enforces:
 * stock can only be held or sold if it is physically there and not already held,
 * and nothing is sold when the machine is offline or too warm.
 */
export class Fleet extends EventEmitter<FleetEvents> {
  constructor(
    private state: FleetState,
    private readonly persist: (state: FleetState) => void,
  ) {
    super();
  }

  static fresh(now = new Date()): FleetState {
    return {
      version: 1,
      machines: MACHINES.map((m) => ({
        id: m.id,
        name: m.name,
        status: m.isSeasonal ? "offline" : "online",
        temperatureC: m.isSeasonal ? 23.5 : 4,
        targetTemperatureC: 4,
        salesLocked: m.isSeasonal,
        notice: m.notice,
        lastSeenAt: now.toISOString(),
        slots: buildPlanogram(m.id, now),
        holds: [],
      })),
      vends: [],
    };
  }

  get snapshot(): FleetState {
    return this.state;
  }

  // ---------------------------------------------------------------- queries

  list(): MachineSummary[] {
    return this.state.machines.map((m) => this.summary(m));
  }

  machine(machineId: string): MachineState {
    const machine = this.state.machines.find((m) => m.id === machineId);
    if (!machine) throw notFound(`Machine ${machineId}`);
    return machine;
  }

  summary(m: MachineState): MachineSummary {
    return {
      id: m.id,
      name: m.name,
      status: m.status,
      temperatureC: m.temperatureC,
      salesLocked: m.salesLocked,
      notice: m.notice,
      lastSeenAt: m.lastSeenAt,
    };
  }

  inventory(machineId: string): Inventory {
    const m = this.machine(machineId);
    const items = this.skusOf(m).map((sku) => {
      const slots = m.slots.filter((s) => s.sku === sku);
      const onHand = slots.reduce((sum, s) => sum + s.qty, 0);
      const held = this.heldFor(m, sku);
      const expiries = slots.filter((s) => s.qty > 0 && s.expiresAt).map((s) => s.expiresAt!);
      return {
        sku,
        onHand,
        held,
        available: Math.max(0, onHand - held),
        slots: slots.map((s) => s.code),
        nearestExpiry: expiries.sort()[0] ?? null,
      };
    });
    return { machineId: m.id, items, updatedAt: new Date().toISOString() };
  }

  recentVends(machineId: string, limit = 8): VendRecord[] {
    return this.state.vends.filter((v) => v.machineId === machineId).slice(-limit).reverse();
  }

  // ---------------------------------------------------------------- holds

  createHold(machineId: string, input: CreateHoldRequest): Hold {
    const request = CreateHoldRequestSchema.parse(input);
    const m = this.machine(machineId);
    this.assertSellable(m);

    // Idempotent: the same cloud reference never holds stock twice.
    const existing = m.holds.find((h) => h.ref === request.ref && h.status === "active");
    if (existing) return this.toHold(m, existing);

    const items = mergeItems(request.items);
    for (const item of items) {
      const available = this.availableFor(m, item.sku);
      if (available < item.qty) {
        throw new DomainError(
          MachineErrorCode.InsufficientStock,
          available === 0 ? `${item.sku} is sold out here` : `Only ${available} × ${item.sku} left here`,
          409,
        );
      }
    }

    const now = new Date();
    const hold: HoldState = {
      id: `hold_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      ref: request.ref,
      items,
      purpose: request.purpose,
      status: "active",
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + request.ttlSeconds * 1000).toISOString(),
    };
    m.holds.push(hold);
    this.pruneHolds(m);
    this.commit(m, [this.stockChanged(m, "hold", items.map((i) => i.sku))]);
    return this.toHold(m, hold);
  }

  releaseHold(machineId: string, holdId: string): Hold {
    const m = this.machine(machineId);
    const hold = m.holds.find((h) => h.id === holdId);
    if (!hold) throw notFound(`Hold ${holdId}`);
    if (hold.status === "active") {
      hold.status = "released";
      this.commit(m, [this.stockChanged(m, "release", hold.items.map((i) => i.sku))]);
    }
    return this.toHold(m, hold);
  }

  /** Expires overdue holds. Called by the machine's clock. */
  expireHolds(now = Date.now()): void {
    for (const m of this.state.machines) {
      const overdue = m.holds.filter((h) => h.status === "active" && Date.parse(h.expiresAt) <= now);
      if (overdue.length === 0) continue;
      const events: MachineEvent[] = [];
      for (const hold of overdue) {
        hold.status = "expired";
        events.push(this.event("hold.expired", m.id, { holdId: hold.id, ref: hold.ref }));
      }
      events.push(this.stockChanged(m, "expire", overdue.flatMap((h) => h.items.map((i) => i.sku))));
      this.commit(m, events);
    }
  }

  // ---------------------------------------------------------------- vending

  /** Dispenses a held order (customer scanned their QR, or a courier collected it). */
  vendHold(
    machineId: string,
    holdId: string,
    options: { channel: "app" | "courier"; payment?: VendRecord["payment"] },
  ): VendResult {
    const m = this.machine(machineId);
    this.assertSellable(m);
    const hold = m.holds.find((h) => h.id === holdId);
    if (!hold) throw notFound(`Hold ${holdId}`);
    if (hold.status !== "active") {
      throw new DomainError(MachineErrorCode.HoldNotActive, `This reservation is ${hold.status}`, 409);
    }
    if (Date.parse(hold.expiresAt) <= Date.now()) {
      this.expireHolds();
      throw new DomainError(MachineErrorCode.HoldNotActive, "This reservation has expired", 409);
    }

    const vended = hold.items.flatMap((item) => this.takeFromSlots(m, item.sku, item.qty));
    hold.status = "consumed";
    return this.recordVend(m, {
      holdId: hold.id,
      ref: hold.ref,
      channel: options.channel,
      items: vended,
      payment: options.payment ?? null,
    });
  }

  /** Someone walks up, picks a slot and pays on the machine's card reader. */
  walkUp(machineId: string, slotCode: string, method: "card" | "cash"): VendRecord {
    const m = this.machine(machineId);
    this.assertSellable(m);
    const slot = m.slots.find((s) => s.code === slotCode);
    if (!slot) throw notFound(`Slot ${slotCode}`);
    if (!slot.sku || slot.qty === 0) {
      throw new DomainError(MachineErrorCode.InsufficientStock, "This slot is empty", 409);
    }
    if (this.availableFor(m, slot.sku) < 1) {
      throw new DomainError(MachineErrorCode.InsufficientStock, `The last ${slot.name} is reserved by an app order`, 409);
    }

    slot.qty -= 1;
    const unitPriceCents = slot.priceCents ?? 0;
    return this.recordVend(m, {
      holdId: null,
      ref: null,
      channel: "walk_up",
      items: [{ sku: slot.sku, qty: 1, slot: slot.code, unitPriceCents }],
      payment: { method, amountCents: unitPriceCents, reference: `pos_${randomUUID().slice(0, 8)}` },
    });
  }

  // ---------------------------------------------------------------- operations

  restock(machineId: string, slotCode?: string): void {
    const m = this.machine(machineId);
    const expiresAt = new Date(Date.now() + RESTOCK_SHELF_LIFE_HOURS * HOUR_MS).toISOString();
    const targets = m.slots.filter((s) => s.sku && (!slotCode || s.code === slotCode));
    if (slotCode && targets.length === 0) throw notFound(`Slot ${slotCode}`);
    for (const slot of targets) {
      slot.qty = slot.capacity;
      slot.expiresAt = expiresAt;
    }
    this.commit(m, [this.stockChanged(m, "restock", targets.map((s) => s.sku!))]);
  }

  update(machineId: string, patch: MachinePatch): MachineSummary {
    const m = this.machine(machineId);
    const wasOnline = m.status === "online";
    if (patch.status) m.status = patch.status;
    if (patch.temperatureC !== undefined) {
      m.temperatureC = round1(patch.temperatureC);
      m.targetTemperatureC = Math.min(patch.temperatureC, 4);
    }
    if (patch.notice !== undefined) m.notice = patch.notice?.trim() || null;
    m.salesLocked = this.shouldLock(m);

    const events: MachineEvent[] = [this.statusEvent(m)];
    if (!wasOnline && m.status === "online") events.push(this.snapshotEvent(m));
    this.commit(m, events);
    return this.summary(m);
  }

  /** Cooling drift + heartbeat. Called every few seconds. */
  tick(options: { heartbeat: boolean }): void {
    for (const m of this.state.machines) {
      if (m.status !== "online") continue;
      const before = m.temperatureC;
      const pull = (m.targetTemperatureC - m.temperatureC) * 0.15;
      m.temperatureC = round1(m.temperatureC + pull + (Math.random() - 0.5) * 0.2);
      const lockedBefore = m.salesLocked;
      m.salesLocked = this.shouldLock(m);
      m.lastSeenAt = new Date().toISOString();

      if (options.heartbeat || lockedBefore !== m.salesLocked) {
        this.commit(m, [this.statusEvent(m)]);
      } else if (before !== m.temperatureC) {
        this.emit("changed", m.id);
      }
    }
  }

  /** Puts every machine back to its day-one planogram. */
  reset(): void {
    this.state = Fleet.fresh();
    for (const m of this.state.machines) this.commit(m, [this.statusEvent(m), this.snapshotEvent(m)]);
  }

  /** Re-announces full inventory + status, e.g. when the machine boots. */
  announce(): void {
    for (const m of this.state.machines) {
      this.emit("machineEvent", this.statusEvent(m));
      this.emit("machineEvent", this.snapshotEvent(m));
    }
  }

  // ---------------------------------------------------------------- internals

  private skusOf(m: MachineState): string[] {
    return [...new Set(m.slots.map((s) => s.sku).filter((s): s is string => Boolean(s)))];
  }

  private onHandFor(m: MachineState, sku: string): number {
    return m.slots.filter((s) => s.sku === sku).reduce((sum, s) => sum + s.qty, 0);
  }

  private heldFor(m: MachineState, sku: string): number {
    return m.holds
      .filter((h) => h.status === "active")
      .flatMap((h) => h.items)
      .filter((i) => i.sku === sku)
      .reduce((sum, i) => sum + i.qty, 0);
  }

  private availableFor(m: MachineState, sku: string): number {
    return Math.max(0, this.onHandFor(m, sku) - this.heldFor(m, sku));
  }

  private shouldLock(m: MachineState): boolean {
    return m.status !== "online" || m.temperatureC > SAFE_MAX_TEMPERATURE_C;
  }

  private assertSellable(m: MachineState): void {
    if (m.status !== "online") {
      throw new DomainError(MachineErrorCode.MachineUnavailable, `${m.name} is ${m.status}`, 423);
    }
    if (m.salesLocked) {
      throw new DomainError(
        MachineErrorCode.MachineUnavailable,
        `${m.name} paused sales: cabinet is ${m.temperatureC}°C`,
        423,
      );
    }
  }

  /** Takes units first-expiring-first-out across the slots that carry the SKU. */
  private takeFromSlots(m: MachineState, sku: string, qty: number) {
    const slots = m.slots
      .filter((s) => s.sku === sku && s.qty > 0)
      .sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));
    const taken: VendRecord["items"] = [];
    let remaining = qty;
    for (const slot of slots) {
      if (remaining === 0) break;
      const n = Math.min(slot.qty, remaining);
      slot.qty -= n;
      remaining -= n;
      if (slot.qty === 0) slot.expiresAt = null;
      taken.push({ sku, qty: n, slot: slot.code, unitPriceCents: slot.priceCents ?? 0 });
    }
    if (remaining > 0) {
      throw new DomainError(MachineErrorCode.InsufficientStock, `Slot jam: missing ${remaining} × ${sku}`, 409);
    }
    return taken;
  }

  private recordVend(m: MachineState, vend: Omit<VendRecord, "vendId" | "machineId" | "completedAt">): VendRecord {
    const record: VendRecord = {
      vendId: `vend_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
      machineId: m.id,
      completedAt: new Date().toISOString(),
      ...vend,
    };
    this.state.vends.push(record);
    if (this.state.vends.length > MAX_VEND_HISTORY) this.state.vends.splice(0, this.state.vends.length - MAX_VEND_HISTORY);

    this.commit(m, [
      this.event("vend.completed", m.id, {
        vendId: record.vendId,
        holdId: record.holdId,
        ref: record.ref,
        channel: record.channel,
        items: mergeVended(record.items),
        payment: record.payment,
      }),
      this.stockChanged(m, "vend", record.items.map((i) => i.sku)),
    ]);
    return record;
  }

  private pruneHolds(m: MachineState): void {
    const closed = m.holds.filter((h) => h.status !== "active");
    if (closed.length <= MAX_CLOSED_HOLDS_PER_MACHINE) return;
    const drop = new Set(closed.slice(0, closed.length - MAX_CLOSED_HOLDS_PER_MACHINE));
    m.holds = m.holds.filter((h) => !drop.has(h));
  }

  private toHold(m: MachineState, hold: HoldState): Hold {
    return { ...hold, machineId: m.id };
  }

  private stockLevels(m: MachineState, skus: string[]): StockLevel[] {
    return [...new Set(skus)].map((sku) => ({ sku, onHand: this.onHandFor(m, sku), held: this.heldFor(m, sku) }));
  }

  private stockChanged(
    m: MachineState,
    reason: MachineEventOf<"stock.changed">["data"]["reason"],
    skus: string[],
  ): MachineEvent {
    return this.event("stock.changed", m.id, { reason, items: this.stockLevels(m, skus) });
  }

  private statusEvent(m: MachineState): MachineEvent {
    return this.event("machine.status", m.id, {
      status: m.status,
      temperatureC: m.temperatureC,
      salesLocked: m.salesLocked,
      notice: m.notice,
    });
  }

  private snapshotEvent(m: MachineState): MachineEvent {
    const inventory = this.inventory(m.id);
    return this.event("inventory.snapshot", m.id, {
      items: inventory.items.map(({ sku, onHand, held, slots, nearestExpiry }) => ({
        sku,
        onHand,
        held,
        slots,
        nearestExpiry,
      })),
    });
  }

  private event<T extends MachineEventType>(type: T, machineId: string, data: MachineEventOf<T>["data"]): MachineEvent {
    return {
      id: `evt_${randomUUID()}`,
      machineId,
      occurredAt: new Date().toISOString(),
      type,
      data,
    } as MachineEvent;
  }

  private commit(m: MachineState, events: MachineEvent[]): void {
    m.lastSeenAt = new Date().toISOString();
    this.persist(this.state);
    for (const event of events) this.emit("machineEvent", event);
    this.emit("changed", m.id);
  }
}

function mergeItems(items: HoldItem[]): HoldItem[] {
  const merged = new Map<string, number>();
  for (const item of items) merged.set(item.sku, (merged.get(item.sku) ?? 0) + item.qty);
  return [...merged].map(([sku, qty]) => ({ sku, qty }));
}

function mergeVended(items: VendRecord["items"]) {
  const merged = new Map<string, { sku: string; qty: number; unitPriceCents: number }>();
  for (const item of items) {
    const entry = merged.get(item.sku) ?? { sku: item.sku, qty: 0, unitPriceCents: item.unitPriceCents };
    entry.qty += item.qty;
    merged.set(item.sku, entry);
  }
  return [...merged.values()];
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export type { SlotState };
