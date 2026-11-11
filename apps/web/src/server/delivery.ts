import "server-only";
import { Types } from "mongoose";
import { distanceKm, type LatLng } from "@/lib/geo";
import { Driver, Order, Payment } from "./db/models";
import { withTransaction } from "./db/mongo";
import { AppError, Errors } from "./errors";
import { machineGateway } from "./machines/gateway";
import { getMachine, listMachines, isSelling } from "./machines/service";
import { feed, notify } from "./notifications";
import { finishFulfilledOrder, markCourierCollected, toOrderDTO, type OrderLean } from "./orders/service";
import { deliveryFee, quoteCart } from "./pricing";
import { publish } from "./realtime/bus";
import { getSettings } from "./settings";
import { productsBySku } from "./catalog";

/**
 * Own delivery channel (deck phase 2, built here as a demo):
 * placed → assigned (driver) → picked_up (driver collects at the machine) → on_the_way → delivered.
 */

export type DeliveryQuote = {
  machineId: string;
  machineName: string;
  km: number;
  feeCents: number;
  etaMinutes: number;
  missing: string[];
};

/** Picks the nearest selling fridge that has every item, and prices the delivery. */
export async function quoteDelivery(items: { sku: string; qty: number }[], to: LatLng): Promise<DeliveryQuote | null> {
  const settings = await getSettings();
  if (!settings.delivery.enabled) return null;
  const machines = await listMachines({ near: to, withStock: true });
  const products = await productsBySku(items.map((i) => i.sku));

  let best: DeliveryQuote | null = null;
  for (const m of machines) {
    if (!isSelling(m)) continue;
    const [lng, lat] = m.location.coordinates as [number, number];
    const km = Math.round(distanceKm({ lat, lng }, to) * 10) / 10;
    if (km > settings.delivery.maxKm) continue;
    const missing = items
      .filter((i) => {
        const s = m.stock?.find((x) => x.sku === i.sku);
        return Math.max(0, (s?.onHand ?? 0) - (s?.held ?? 0)) < i.qty;
      })
      .map((i) => products.get(i.sku)?.name ?? i.sku);
    const goods = quoteCart(
      items.flatMap((i) => {
        const p = products.get(i.sku);
        return p ? [{ product: { productId: String(p._id), sku: p.sku, name: p.name, category: p.category, priceCents: p.priceCents }, qty: i.qty }] : [];
      }),
      { now: new Date() },
      settings.pricing,
    );
    const quote: DeliveryQuote = {
      machineId: m._id,
      machineName: m.name,
      km,
      feeCents: deliveryFee(km, goods.totalCents, settings.delivery),
      etaMinutes: Math.round(12 + km * 3),
      missing,
    };
    if (missing.length === 0) return quote; // machines are sorted nearest-first
    best ??= quote;
  }
  return best;
}

/** One step of the courier simulation; also used by the admin's "Advance" button. */
export async function advanceDelivery(order: OrderLean, options: { force?: boolean } = {}): Promise<boolean> {
  const settings = await getSettings();
  const speed = settings.delivery.demoSpeed;
  const now = Date.now();
  const since = (d?: Date | null) => (d ? now - d.getTime() : 0) * speed;

  switch (order.status) {
    case "placed": {
      if (!options.force && since(order.timeline?.placedAt) < 12_000) return false;
      const drivers = await Driver.find({ isActive: true }).lean();
      const driver = drivers[Math.floor(Math.random() * drivers.length)];
      if (!driver) return false;
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: "placed" },
        { $set: { status: "assigned", "delivery.driverId": driver._id, "timeline.assignedAt": new Date() } },
        { new: true },
      ).lean<OrderLean>();
      if (!updated) return false;
      await broadcast(updated);
      if (updated.userId) {
        await notify(updated.userId, {
          kind: "order",
          title: `${driver.name.split(" ")[0]} is on it`,
          body: `Heading to the fridge to collect order ${updated.number}.`,
          href: `/orders/${String(updated._id)}`,
        });
      }
      feed("order", `Driver ${driver.name} assigned to ${updated.number}`);
      return true;
    }
    case "assigned": {
      if (!options.force && since(order.timeline?.assignedAt) < 15_000) return false;
      if (!order.hold?.id) return false;
      try {
        // The courier collects at the machine — a remote vend of the held items.
        await machineGateway.vend(order.machineId, order.hold.id);
      } catch (error) {
        if (!(error instanceof AppError && error.code === "hold_not_active")) return false; // machine down: retry later
      }
      await markCourierCollected(order); // the vend webhook does the same; whichever comes first wins
      return true;
    }
    case "picked_up": {
      if (!options.force && since(order.timeline?.pickedUpAt) < 4_000) return false;
      const travelSeconds = Math.min(240, Math.max(45, (order.delivery?.km ?? 2) * 35)) / speed;
      const updated = await Order.findOneAndUpdate(
        { _id: order._id, status: "picked_up" },
        {
          $set: {
            status: "on_the_way",
            "timeline.onTheWayAt": new Date(),
            "delivery.etaAt": new Date(now + (options.force ? 20_000 : travelSeconds * 1000)),
          },
        },
        { new: true },
      ).lean<OrderLean>();
      if (updated) await broadcast(updated);
      return Boolean(updated);
    }
    case "on_the_way": {
      if (!options.force && (order.delivery?.etaAt?.getTime() ?? 0) > now) return false;
      return completeDelivery(order);
    }
    default:
      return false;
  }
}

async function completeDelivery(order: OrderLean): Promise<boolean> {
  const delivered = await withTransaction(async (session) => {
    const updated = await Order.findOneAndUpdate(
      { _id: order._id, status: "on_the_way" },
      {
        $set: {
          status: "delivered",
          "timeline.deliveredAt": new Date(),
          ...(order.payment.method === "cash" ? { "payment.status": "paid", "payment.paidAt": new Date() } : {}),
        },
      },
      { new: true, session },
    ).lean<OrderLean>();
    if (updated && order.payment.method === "cash") {
      await Payment.create(
        [{ userId: order.userId, orderId: order._id, purpose: "order", method: "cash", provider: "sandbox", amountCents: order.totals.totalCents, status: "succeeded", providerRef: `cod_${order.number}` }],
        { session },
      );
    }
    return updated;
  });
  if (!delivered) return false;
  await finishFulfilledOrder(delivered, "delivered");
  return true;
}

export async function runDeliveryAutopilot(): Promise<void> {
  const settings = await getSettings();
  if (!settings.delivery.autoDispatch) return;
  const active = await Order.find({ fulfillment: "delivery", status: { $in: ["placed", "assigned", "picked_up", "on_the_way"] } })
    .limit(25)
    .lean<OrderLean[]>();
  for (const order of active) await advanceDelivery(order);
}

/** Admin: push a delivery to its next step now. */
export async function adminAdvanceDelivery(orderId: string): Promise<void> {
  if (!Types.ObjectId.isValid(orderId)) throw Errors.notFound("Order");
  const order = await Order.findById(orderId).lean<OrderLean>();
  if (!order || order.fulfillment !== "delivery") throw Errors.notFound("Delivery");
  const moved = await advanceDelivery(order, { force: true });
  if (!moved) throw Errors.conflict("This delivery can't move forward right now (is the fridge online?).");
}

async function broadcast(order: OrderLean) {
  if (order.userId) publish(`user:${String(order.userId)}`, { type: "order", order: await toOrderDTO(order) });
  publish("admin", { type: "order", order: await toOrderDTO(order, { withCustomer: true }) });
}

export async function machineName(id: string) {
  return (await getMachine(id))?.name ?? id;
}
