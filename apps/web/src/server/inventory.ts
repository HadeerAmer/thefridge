import "server-only";
import type { StockLevel } from "@thefridge/shared/contracts";
import { Machine, Product, StockAlert } from "./db/models";
import { machineGateway } from "./machines/gateway";
import { getMachine, toMachineDTO, type MachineLean } from "./machines/service";
import { feed, notify } from "./notifications";
import { publish } from "./realtime/bus";

/**
 * The cloud's projection of each machine's stock, kept current from machine webhooks.
 * Every change is broadcast so open apps update live, and "notify me" alerts fire
 * when an item comes back.
 */

type SnapshotItem = StockLevel & { slots?: string[]; nearestExpiry?: string | null };

function availableMap(machine: MachineLean | null): Map<string, number> {
  return new Map((machine?.stock ?? []).map((s) => [s.sku, Math.max(0, s.onHand - s.held)]));
}

function broadcast(machineId: string, levels: StockLevel[]) {
  publish("public", {
    type: "stock",
    machineId,
    items: levels.map((l) => ({ sku: l.sku, onHand: l.onHand, held: l.held, available: Math.max(0, l.onHand - l.held) })),
  });
}

export async function applyStockLevels(machineId: string, levels: StockLevel[]): Promise<void> {
  if (levels.length === 0) return;
  const machine = await getMachine(machineId);
  if (!machine) return;
  const before = availableMap(machine);

  // One atomic update for every changed SKU (arrayFilters). Unknown SKUs arrive via full snapshots.
  const known = levels.filter((l) => before.has(l.sku));
  const set: Record<string, unknown> = { lastSeenAt: new Date() };
  known.forEach((level, i) => {
    set[`stock.$[s${i}].onHand`] = level.onHand;
    set[`stock.$[s${i}].held`] = level.held;
  });
  await Machine.updateOne(
    { _id: machineId },
    { $set: set },
    { arrayFilters: known.map((level, i) => ({ [`s${i}.sku`]: level.sku })) },
  );
  if (known.length < levels.length) scheduleResync(machineId, 200);
  broadcast(machineId, levels);
  await alertBackInStock(machineId, levels, before);
}

export async function applySnapshot(machineId: string, items: SnapshotItem[]): Promise<void> {
  const before = availableMap(await getMachine(machineId));
  await Machine.updateOne(
    { _id: machineId },
    {
      $set: {
        stock: items.map((i) => ({
          sku: i.sku,
          onHand: i.onHand,
          held: i.held,
          slots: i.slots ?? [],
          nearestExpiry: i.nearestExpiry ? new Date(i.nearestExpiry) : undefined,
        })),
        lastSyncAt: new Date(),
        lastSeenAt: new Date(),
      },
    },
  );
  broadcast(machineId, items);
  await alertBackInStock(machineId, items, before);
}

/** Pulls the full inventory from the machine (boot, reconnect, after restocks). */
export async function syncMachine(machineId: string): Promise<boolean> {
  try {
    const inventory = await machineGateway.inventory(machineId);
    await applySnapshot(machineId, inventory.items);
    return true;
  } catch {
    return false;
  }
}

/** Refreshes status + inventory of every machine the fleet reports. */
export async function syncFleet(): Promise<boolean> {
  let summaries;
  try {
    summaries = await machineGateway.listMachines();
  } catch {
    return false;
  }
  for (const s of summaries) {
    await applyMachineStatus(s.id, s, { quiet: true });
    if (s.status === "online") await syncMachine(s.id);
  }
  return true;
}

const resyncTimers = new Map<string, NodeJS.Timeout>();
/** Debounced resync — after vends/restocks the slot expiries change. */
export function scheduleResync(machineId: string, delayMs = 1500): void {
  clearTimeout(resyncTimers.get(machineId));
  resyncTimers.set(
    machineId,
    setTimeout(() => {
      resyncTimers.delete(machineId);
      void syncMachine(machineId);
    }, delayMs),
  );
}

export async function applyMachineStatus(
  machineId: string,
  status: { status: "online" | "offline" | "maintenance"; temperatureC: number; salesLocked: boolean; notice: string | null },
  options: { quiet?: boolean } = {},
): Promise<void> {
  const before = await getMachine(machineId);
  if (!before) return;
  const after = await Machine.findOneAndUpdate(
    { _id: machineId },
    {
      $set: {
        status: status.status,
        temperatureC: status.temperatureC,
        salesLocked: status.salesLocked,
        notice: status.notice,
        lastSeenAt: new Date(),
      },
    },
    { new: true },
  ).lean<MachineLean>();
  if (!after) return;

  const changed =
    before.status !== after.status || before.salesLocked !== after.salesLocked || (before.notice ?? null) !== (after.notice ?? null);
  if (!changed) return;

  publish("public", { type: "machine", machine: toMachineDTO(after) });
  if (options.quiet) return;
  if (before.salesLocked !== after.salesLocked && after.status === "online") {
    feed(
      "machine",
      after.salesLocked
        ? `⚠️ ${after.name} paused sales — cabinet at ${after.temperatureC.toFixed(1)}°C`
        : `✅ ${after.name} is selling again (${after.temperatureC.toFixed(1)}°C)`,
    );
  } else if (before.status !== after.status) {
    feed("machine", `${after.name} is now ${after.status}`);
  } else if ((before.notice ?? null) !== (after.notice ?? null)) {
    feed("machine", after.notice ? `📢 ${after.name}: “${after.notice}”` : `${after.name} notice cleared`);
  }
}

async function alertBackInStock(machineId: string, levels: StockLevel[], before: Map<string, number>) {
  const restocked = levels.filter((l) => (before.get(l.sku) ?? 0) === 0 && l.onHand - l.held > 0).map((l) => l.sku);
  if (restocked.length === 0) return;

  const [machine, alerts] = await Promise.all([
    getMachine(machineId),
    StockAlert.find({
      sku: { $in: restocked },
      notifiedAt: null,
      $or: [{ machineId }, { machineId: null }],
    }).lean(),
  ]);
  if (!machine || alerts.length === 0) return;
  const products = new Map(
    (await Product.find({ sku: { $in: restocked } }, { sku: 1, slug: 1 }).lean()).map((p) => [p.sku, p.slug]),
  );

  for (const alert of alerts) {
    await notify(alert.userId, {
      kind: "stock",
      title: `${alert.productName} is back 🎉`,
      body: `Back in stock at ${machine.name}. Reserve it before it's gone.`,
      href: `/p/${products.get(alert.sku) ?? ""}?fridge=${machineId}`,
    });
  }
  await StockAlert.updateMany({ _id: { $in: alerts.map((a) => a._id) } }, { $set: { notifiedAt: new Date() } });
  feed("stock", `Back in stock at ${machine.name}: ${restocked.join(", ")} · ${alerts.length} alert(s) sent`);
}
