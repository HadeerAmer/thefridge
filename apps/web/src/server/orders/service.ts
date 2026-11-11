import "server-only";
import { Types } from "mongoose";
import { z } from "zod";
import type { MachineEventOf, RedeemResponse } from "@thefridge/shared/contracts";
import { distanceKm } from "@/lib/geo";
import { formatEgp } from "@/lib/money";
import type { Celebration, OrderDTO } from "@/lib/types";
import { productsBySku } from "../catalog";
import { newCourierCode, newOrderNumber, newPickupCode, newWalkUpNumber } from "../codes";
import { Driver, Order, Payment, Product, User, type OrderDoc, type ProductDoc, type UserDoc } from "../db/models";
import { withTransaction } from "../db/mongo";
import { AppError, Errors } from "../errors";
import { rewardReferralIfDue } from "../loyalty/referrals";
import { awardOrder } from "../loyalty/service";
import { machineGateway } from "../machines/gateway";
import { getMachine, isSelling, listMachines, type MachineLean } from "../machines/service";
import { feed, notify } from "../notifications";
import { logOrderNutrition } from "../nutrition/service";
import { CardSchema, paymentProvider } from "../payments";
import { deliveryFee, quoteCart, type Quote } from "../pricing";
import { publish } from "../realtime/bus";
import { getSettings, type Settings } from "../settings";
import { creditWallet, debitWallet } from "../wallet";

export type OrderLean = OrderDoc;

// ------------------------------------------------------------------ input

export const CreateOrderSchema = z
  .object({
    machineId: z.string().min(1),
    items: z.array(z.object({ sku: z.string().min(3), qty: z.number().int().min(1).max(5) })).min(1).max(10),
    fulfillment: z.enum(["pickup", "delivery"]),
    paymentMethod: z.enum(["wallet", "card", "pay_at_fridge", "cash"]),
    card: CardSchema.optional(),
    delivery: z
      .object({
        address: z.string().trim().min(3).max(200),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    idempotencyKey: z.string().min(8).max(64),
  })
  .superRefine((value, ctx) => {
    if (value.fulfillment === "pickup" && value.paymentMethod === "cash") {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "For pickup, pay at the fridge instead of cash." });
    }
    if (value.fulfillment === "delivery" && value.paymentMethod === "pay_at_fridge") {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Deliveries are paid in the app or cash on delivery." });
    }
    if (value.fulfillment === "delivery" && !value.delivery) {
      ctx.addIssue({ code: "custom", path: ["delivery"], message: "Add a delivery address." });
    }
    if (value.paymentMethod === "card" && !value.card) {
      ctx.addIssue({ code: "custom", path: ["card"], message: "Add card details." });
    }
  });
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

const CANCELLABLE = ["reserved", "placed"] as const;
const PICKUP_ACTIVE = ["reserved"] as const;

// ------------------------------------------------------------------ DTO mapping

export async function toOrderDTOs(orders: OrderLean[], options: { withCustomer?: boolean } = {}): Promise<OrderDTO[]> {
  if (orders.length === 0) return [];
  const machines = new Map((await listMachines()).map((m) => [m._id, m]));
  const driverIds = orders.map((o) => o.delivery?.driverId).filter(Boolean);
  const drivers = new Map(
    (await Driver.find({ _id: { $in: driverIds } }).lean()).map((d) => [String(d._id), d]),
  );
  const customers = options.withCustomer
    ? new Map(
        (await User.find({ _id: { $in: orders.map((o) => o.userId).filter(Boolean) } }, { name: 1, phone: 1 }).lean()).map(
          (u) => [String(u._id), u],
        ),
      )
    : null;

  return orders.map((o) => {
    const machine = machines.get(o.machineId);
    const [lng, lat] = (machine?.location.coordinates ?? [0, 0]) as [number, number];
    const driver = o.delivery?.driverId ? drivers.get(String(o.delivery.driverId)) : undefined;
    const customer = o.userId && customers ? customers.get(String(o.userId)) : undefined;
    const timeline = Object.fromEntries(
      Object.entries(o.timeline ?? {})
        .filter(([, v]) => v instanceof Date)
        .map(([k, v]) => [k, (v as Date).toISOString()]),
    );
    const finishedAt = o.timeline?.completedAt ?? o.timeline?.deliveredAt;
    return {
      id: String(o._id),
      number: o.number,
      status: o.status,
      fulfillment: o.fulfillment,
      machine: { id: o.machineId, name: machine?.name ?? o.machineId, area: machine?.area ?? "", lat, lng },
      payment: { method: o.payment.method, status: o.payment.status ?? "unpaid" },
      items: o.items.map((i) => ({
        sku: i.sku,
        name: i.name,
        category: i.category as OrderDTO["items"][number]["category"],
        qty: i.qty,
        unitPriceCents: i.unitPriceCents,
        listPriceCents: i.listPriceCents,
        discountLabel: i.discountLabel ?? null,
        nutrition: {
          kcal: i.nutrition?.kcal ?? 0,
          proteinG: i.nutrition?.proteinG ?? 0,
          carbsG: i.nutrition?.carbsG ?? 0,
          fatG: i.nutrition?.fatG ?? 0,
        },
      })),
      totals: {
        subtotalCents: o.totals.subtotalCents,
        discountCents: o.totals.discountCents ?? 0,
        deliveryFeeCents: o.totals.deliveryFeeCents ?? 0,
        totalCents: o.totals.totalCents,
      },
      promos: o.promos ?? [],
      pointsEarned: o.pointsEarned ?? 0,
      pickupCode: o.status === "reserved" ? (o.pickupCode ?? null) : null,
      holdExpiresAt: o.hold?.expiresAt ? o.hold.expiresAt.toISOString() : null,
      delivery:
        o.fulfillment === "delivery" && o.delivery
          ? {
              address: o.delivery.address ?? "",
              lat: o.delivery.lat ?? 0,
              lng: o.delivery.lng ?? 0,
              km: o.delivery.km ?? 0,
              etaAt: o.delivery.etaAt ? o.delivery.etaAt.toISOString() : null,
              driver: driver ? { name: driver.name, vehicle: driver.vehicle } : null,
              courierCode: options.withCustomer ? (o.delivery.courierCode ?? null) : null,
            }
          : null,
      timeline,
      customer: customer ? { name: customer.name, phone: customer.phone } : null,
      createdAt: o.createdAt.toISOString(),
      failureReason: o.failureReason ?? null,
      canCancel: (CANCELLABLE as readonly string[]).includes(o.status),
      canReportIssue:
        ["completed", "delivered"].includes(o.status) && !!finishedAt && Date.now() - finishedAt.getTime() < 48 * 3_600_000,
    } satisfies OrderDTO;
  });
}

export async function toOrderDTO(order: OrderLean, options?: { withCustomer?: boolean }): Promise<OrderDTO> {
  return (await toOrderDTOs([order], options))[0]!;
}

async function broadcastOrder(order: OrderLean, celebrate?: Celebration | null) {
  const [dto, adminDto] = await Promise.all([toOrderDTO(order), toOrderDTO(order, { withCustomer: true })]);
  if (order.userId) {
    publish(`user:${String(order.userId)}`, { type: "order", order: dto, ...(celebrate ? { celebrate } : {}) });
    publish(`user:${String(order.userId)}`, { type: "me" });
  }
  publish("admin", { type: "order", order: adminDto });
  return dto;
}

// ------------------------------------------------------------------ queries

export async function listUserOrders(userId: string, limit = 30): Promise<OrderDTO[]> {
  const orders = await Order.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean<OrderLean[]>();
  return toOrderDTOs(orders);
}

export async function getUserOrder(userId: string, orderId: string): Promise<OrderDTO> {
  if (!Types.ObjectId.isValid(orderId)) throw Errors.notFound("Order");
  const order = await Order.findOne({ _id: orderId, userId }).lean<OrderLean>();
  if (!order) throw Errors.notFound("Order");
  return toOrderDTO(order);
}

/** The usual: most-ordered item, for one-tap reorder on Home. */
export async function usualItem(userId: string): Promise<{ sku: string; machineId: string; count: number } | null> {
  const [row] = await Order.aggregate<{ _id: { sku: string; machineId: string }; count: number }>([
    { $match: { userId: new Types.ObjectId(userId), status: { $in: ["completed", "delivered"] } } },
    { $unwind: "$items" },
    { $group: { _id: { sku: "$items.sku", machineId: "$machineId" }, count: { $sum: "$items.qty" } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);
  return row ? { sku: row._id.sku, machineId: row._id.machineId, count: row.count } : null;
}

// ------------------------------------------------------------------ create (reserve / order)

export async function createOrder(userIdRaw: string, input: CreateOrderInput): Promise<OrderDTO> {
  const userId = new Types.ObjectId(userIdRaw);
  const existing = await Order.findOne({ userId, idempotencyKey: input.idempotencyKey }).lean<OrderLean>();
  if (existing) return toOrderDTO(existing); // double-tap / retry: same order, no second charge

  const [settings, user, machine] = await Promise.all([
    getSettings(),
    User.findById(userId).lean<UserDoc>(),
    getMachine(input.machineId),
  ]);
  if (!user) throw Errors.unauthorized();
  if (!machine) throw Errors.notFound("Fridge");
  assertSelling(machine);

  const isDelivery = input.fulfillment === "delivery";
  if (isDelivery && !settings.delivery.enabled) throw new AppError("delivery_off", "Delivery is paused right now.", 409);
  if (!isDelivery) {
    const active = await Order.countDocuments({ userId, status: { $in: PICKUP_ACTIVE } });
    if (active >= settings.reservation.maxActivePerUser) {
      throw Errors.conflict(`You already have ${active} active reservation${active > 1 ? "s" : ""}. Collect or cancel one first.`);
    }
  }

  // Merge duplicate lines and load products.
  const merged = new Map<string, number>();
  for (const item of input.items) merged.set(item.sku, (merged.get(item.sku) ?? 0) + item.qty);
  const products = await productsBySku([...merged.keys()]);
  const lines = [...merged].map(([sku, qty]) => {
    const product = products.get(sku);
    if (!product) throw Errors.notFound(`Product ${sku}`);
    return { product, qty };
  });

  // Fast check against the live projection (the machine re-checks when we place the hold).
  for (const { product, qty } of lines) {
    const entry = machine.stock?.find((s) => s.sku === product.sku);
    const available = Math.max(0, (entry?.onHand ?? 0) - (entry?.held ?? 0));
    if (available < qty) {
      throw new AppError(
        "sold_out",
        available === 0 ? `${product.name} just sold out at ${machine.name}.` : `Only ${available} × ${product.name} left at ${machine.name}.`,
        409,
        { sku: product.sku, available },
      );
    }
  }

  // Price it (same function the checkout quote uses, so the shown total is the charged total).
  const now = new Date();
  const { quote, km } = priceLines({ machine, user, lines, delivery: isDelivery ? input.delivery! : null, settings, now });
  if (isDelivery && km > settings.delivery.maxKm) {
    throw Errors.invalid(`That address is ${km.toFixed(1)} km from ${machine.name}. We deliver up to ${settings.delivery.maxKm} km.`);
  }

  if (input.paymentMethod === "wallet" && (user.walletCents ?? 0) < quote.totalCents) {
    const shortfall = quote.totalCents - (user.walletCents ?? 0);
    throw new AppError(
      "insufficient_funds",
      `Your wallet has ${formatEgp(user.walletCents ?? 0)}. Top up ${formatEgp(shortfall)} or pay by card.`,
      402,
      { shortfallCents: shortfall },
    );
  }

  // 1) Hold the units in the fridge — nobody else can take them from here on.
  const orderId = new Types.ObjectId();
  const holdMinutes = isDelivery ? settings.delivery.holdMinutes : settings.reservation.holdMinutes;
  const hold = await machineGateway.createHold(machine._id, {
    ref: orderId.toString(),
    items: lines.map(({ product, qty }) => ({ sku: product.sku, qty })),
    ttlSeconds: holdMinutes * 60,
    purpose: isDelivery ? "courier" : "customer",
  });

  // 2) Card payments are charged only once the food is secured.
  let cardRef: string | null = null;
  if (input.paymentMethod === "card") {
    const charge = await paymentProvider.charge({
      amountCents: quote.totalCents,
      method: "card",
      card: input.card,
      description: `The Fridge order`,
    });
    if (!charge.ok) {
      await releaseHoldQuietly(machine._id, hold.id);
      throw new AppError("payment_declined", charge.reason, 402);
    }
    cardRef = charge.reference;
  }

  // 3) Record the order (+ wallet debit) atomically. Any failure undoes steps 1–2.
  const paidUpfront = input.paymentMethod === "wallet" || input.paymentMethod === "card";
  let order: OrderLean;
  try {
    order = await withTransaction(async (session) => {
      const number = newOrderNumber();
      if (input.paymentMethod === "wallet") {
        await debitWallet(userId, quote.totalCents, { description: `Order ${number} · ${machine.name}`, orderId }, session);
      }
      if (cardRef) {
        await Payment.create(
          [{ userId, orderId, purpose: "order", method: "card", provider: "sandbox", amountCents: quote.totalCents, status: "succeeded", providerRef: cardRef }],
          { session },
        );
      }
      const [doc] = await Order.create(
        [
          {
            _id: orderId,
            number,
            userId,
            machineId: machine._id,
            channel: "app",
            fulfillment: input.fulfillment,
            status: isDelivery ? "placed" : "reserved",
            payment: {
              method: input.paymentMethod,
              status: paidUpfront ? "paid" : "unpaid",
              paidAt: paidUpfront ? now : undefined,
              reference: cardRef ?? undefined,
            },
            items: quote.lines.map((l) => {
              const product = products.get(l.sku)!;
              return {
                productId: product._id,
                sku: l.sku,
                name: l.name,
                category: l.category,
                qty: l.qty,
                unitPriceCents: l.unitCents,
                listPriceCents: l.listCents,
                discountLabel: l.label ?? undefined,
                nutrition: {
                  kcal: product.nutrition.kcal,
                  proteinG: product.nutrition.proteinG,
                  carbsG: product.nutrition.carbsG,
                  fatG: product.nutrition.fatG,
                },
              };
            }),
            totals: {
              subtotalCents: quote.listTotalCents,
              discountCents: quote.discountCents,
              deliveryFeeCents: quote.deliveryFeeCents,
              totalCents: quote.totalCents,
            },
            promos: quote.promos,
            pickupCode: isDelivery ? undefined : newPickupCode(),
            hold: { id: hold.id, expiresAt: new Date(hold.expiresAt) },
            idempotencyKey: input.idempotencyKey,
            delivery: isDelivery
              ? { address: input.delivery!.address, lat: input.delivery!.lat, lng: input.delivery!.lng, km: Math.round(km * 10) / 10, courierCode: newCourierCode() }
              : undefined,
            timeline: isDelivery ? { placedAt: now } : { reservedAt: now },
          },
        ],
        { session },
      );
      return doc!.toObject() as OrderLean;
    });
  } catch (error) {
    await releaseHoldQuietly(machine._id, hold.id);
    if (cardRef) await paymentProvider.refund(cardRef, quote.totalCents);
    if (isDuplicateKey(error)) {
      const again = await Order.findOne({ userId, idempotencyKey: input.idempotencyKey }).lean<OrderLean>();
      if (again) return toOrderDTO(again);
    }
    throw error;
  }

  const summary = order.items.map((i) => `${i.qty}× ${i.name}`).join(", ");
  feed("order", `${user.name} ${isDelivery ? "ordered delivery of" : "reserved"} ${summary} at ${machine.name} · ${formatEgp(quote.totalCents)}`);
  return broadcastOrder(order);
}

// ------------------------------------------------------------------ cancel / expire

export async function cancelOrder(userId: string, orderId: string): Promise<OrderDTO> {
  if (!Types.ObjectId.isValid(orderId)) throw Errors.notFound("Order");
  const order = await Order.findOne({ _id: orderId, userId }).lean<OrderLean>();
  if (!order) throw Errors.notFound("Order");
  if (!(CANCELLABLE as readonly string[]).includes(order.status)) {
    throw Errors.conflict("This order can't be cancelled any more.");
  }
  if (order.hold?.id) await releaseHoldQuietly(order.machineId, order.hold.id);
  const closed = await closeOrder(order._id, [...CANCELLABLE], "cancelled", "Cancelled by you");
  if (!closed) return getUserOrder(userId, orderId);
  feed("order", `Order ${order.number} cancelled by the customer`);
  return broadcastOrder(closed);
}

/** Hold ran out before collection (machine webhook or our own sweeper). */
export async function expireOrder(orderId: string, reason = "Not collected in time"): Promise<void> {
  if (!Types.ObjectId.isValid(orderId)) return;
  const order = await Order.findById(orderId).lean<OrderLean>();
  if (!order) return;
  const isDelivery = order.fulfillment === "delivery";
  const closed = await closeOrder(
    order._id,
    isDelivery ? ["placed", "assigned"] : ["reserved"],
    isDelivery ? "failed" : "expired",
    isDelivery ? "The courier couldn't collect it in time" : reason,
  );
  if (!closed) return;
  await broadcastOrder(closed);
  if (closed.userId) {
    const refunded = closed.payment.status === "refunded";
    await notify(closed.userId, {
      kind: "order",
      title: isDelivery ? "Sorry — your delivery was cancelled" : "Your reservation expired",
      body: refunded
        ? `${formatEgp(closed.totals.totalCents)} is back in your wallet.`
        : "No charge. Reserve again any time.",
      href: `/orders/${String(closed._id)}`,
    });
  }
  feed("order", `Order ${closed.number} ${closed.status} — hold released`);
}

export async function expireOverdueOrders(now = new Date()): Promise<number> {
  const graceMs = 5000; // let the machine's own hold.expired webhook win first
  const overdue = await Order.find(
    { status: { $in: ["reserved", "placed", "assigned"] }, "hold.expiresAt": { $lt: new Date(now.getTime() - graceMs) } },
    { _id: 1, machineId: 1, hold: 1 },
  ).lean<OrderLean[]>();
  for (const order of overdue) {
    if (order.hold?.id) await releaseHoldQuietly(order.machineId, order.hold.id);
    await expireOrder(String(order._id));
  }
  return overdue.length;
}

/**
 * Moves an order from one of `from` to `to` exactly once, refunding to the wallet if it was paid.
 * Returns null when another process already moved it.
 */
async function closeOrder(
  orderId: Types.ObjectId,
  from: string[],
  to: "cancelled" | "expired" | "failed",
  reason: string,
): Promise<OrderLean | null> {
  const timelineKey = to === "cancelled" ? "cancelledAt" : "expiredAt";
  return withTransaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: { $in: from } },
      { $set: { status: to, failureReason: reason, [`timeline.${timelineKey}`]: new Date() } },
      { new: true, session },
    ).lean<OrderLean>();
    if (!order) return null;
    if (order.payment.status === "paid" && order.userId) {
      await creditWallet(
        order.userId,
        order.totals.totalCents,
        { type: "refund", description: `Refund · order ${order.number}`, orderId: order._id },
        session,
      );
      return Order.findOneAndUpdate(
        { _id: orderId },
        { $set: { "payment.status": "refunded" } },
        { new: true, session },
      ).lean<OrderLean>();
    }
    return order;
  });
}

// ------------------------------------------------------------------ at the machine

/** The machine's scanner read a code: tell it what to dispense and what is still owed. */
export async function redeemCode(machineId: string, rawCode: string): Promise<RedeemResponse> {
  const code = rawCode.trim().toUpperCase();
  const order = await Order.findOne({ $or: [{ pickupCode: code }, { "delivery.courierCode": code }] }).lean<OrderLean>();
  if (!order) throw new AppError("unknown_code", "We don't recognise this code. Check it in The Fridge app.", 404);

  if (order.machineId !== machineId) {
    const right = await getMachine(order.machineId);
    throw new AppError("wrong_fridge", `This order is waiting at ${right?.name ?? "another fridge"}.`, 409);
  }
  const isCourier = order.delivery?.courierCode === code;
  if (isCourier) {
    if (!["placed", "assigned"].includes(order.status)) throw Errors.conflict(`This delivery is already ${order.status.replace("_", " ")}.`);
  } else {
    if (order.status === "completed") throw Errors.conflict("This order was already collected. Enjoy!");
    if (order.status !== "reserved") throw Errors.conflict(`This reservation is ${order.status}.`);
    if (order.hold?.expiresAt && order.hold.expiresAt.getTime() < Date.now()) {
      throw Errors.conflict("This reservation has expired. Reserve again in the app.");
    }
  }
  if (!order.hold?.id) throw Errors.conflict("This order has no items held in the fridge.");

  const customer = order.userId ? await User.findById(order.userId, { name: 1 }).lean() : null;
  return {
    orderId: String(order._id),
    orderNumber: order.number,
    holdId: order.hold.id,
    purpose: isCourier ? "courier" : "customer",
    customerName: isCourier ? "Courier" : (customer?.name ?? null),
    items: order.items.map((i) => ({ sku: i.sku, name: i.name, qty: i.qty, unitPriceCents: i.unitPriceCents })),
    amountDueCents: isCourier || order.payment.status === "paid" ? 0 : order.totals.totalCents,
  };
}

/** The customer paid on the machine's card reader (pay-at-fridge reservations). */
export async function recordMachinePayment(
  machineId: string,
  orderId: string,
  payment: { amountCents: number; method: "card" | "cash"; reference: string },
): Promise<void> {
  if (!Types.ObjectId.isValid(orderId)) throw Errors.notFound("Order");
  const order = await Order.findOne({ _id: orderId, machineId }).lean<OrderLean>();
  if (!order) throw Errors.notFound("Order");
  if (order.payment.status === "paid") return; // idempotent
  if (payment.amountCents !== order.totals.totalCents) throw Errors.conflict("Payment amount doesn't match the order.");

  await withTransaction(async (session) => {
    const updated = await Order.updateOne(
      { _id: order._id, "payment.status": "unpaid" },
      {
        $set: {
          "payment.status": "paid",
          "payment.method": payment.method === "card" ? "machine_card" : "machine_cash",
          "payment.paidAt": new Date(),
          "payment.reference": payment.reference,
        },
      },
      { session },
    );
    if (updated.modifiedCount === 0) return;
    await Payment.create(
      [{ userId: order.userId, orderId: order._id, purpose: "order", method: payment.method === "card" ? "machine_card" : "machine_cash", provider: "machine", amountCents: payment.amountCents, status: "succeeded", providerRef: payment.reference }],
      { session },
    );
  });
  feed("payment", `Order ${order.number} paid at the fridge by ${payment.method} · ${formatEgp(payment.amountCents)}`);
}

/** The machine dispensed something (vend.completed webhook). */
export async function handleVend(machineId: string, data: MachineEventOf<"vend.completed">["data"]): Promise<void> {
  if (data.ref && Types.ObjectId.isValid(data.ref)) {
    const order = await Order.findById(data.ref).lean<OrderLean>();
    if (order?.fulfillment === "pickup") return completePickup(order);
    if (order?.fulfillment === "delivery") return markCourierCollected(order);
  }
  if (data.channel === "walk_up") await recordWalkUp(machineId, data);
}

async function completePickup(order: OrderLean): Promise<void> {
  const completed = await Order.findOneAndUpdate(
    { _id: order._id, status: "reserved" },
    { $set: { status: "completed", "timeline.completedAt": new Date() } },
    { new: true },
  ).lean<OrderLean>();
  if (!completed) return; // already handled (duplicate or late event)
  await finishFulfilledOrder(completed, "collected");
}

/** Shared by pickups and deliveries: loyalty, macros, notification. */
export async function finishFulfilledOrder(order: OrderLean, verb: "collected" | "delivered"): Promise<void> {
  const celebrate = await awardOrder(order);
  await logOrderNutrition(order);
  if (order.userId) await rewardReferralIfDue(order.userId);
  const fresh = (await Order.findById(order._id).lean<OrderLean>()) ?? order;
  await broadcastOrder(fresh, celebrate);

  if (fresh.userId) {
    const parts = [celebrate?.points ? `+${celebrate.points + celebrate.bonus} points` : null];
    if (celebrate?.streak && celebrate.streak > 1) parts.push(`${celebrate.streak}-day streak 🔥`);
    if (celebrate?.freeMealCents) parts.push(`${formatEgp(celebrate.freeMealCents)} stamp-card reward in your wallet`);
    await notify(fresh.userId, {
      kind: "order",
      title: verb === "collected" ? "Enjoy! Always a good cal(l) 🥗" : "Delivered — enjoy! 🛵",
      body: parts.filter(Boolean).join(" · ") || "Thanks for choosing The Fridge.",
      href: `/orders/${String(fresh._id)}`,
    });
  }
  const machine = await getMachine(order.machineId);
  feed("order", `Order ${order.number} ${verb} ${verb === "collected" ? `at ${machine?.name ?? order.machineId}` : `to ${order.delivery?.address ?? "the customer"}`}`);
}

export async function markCourierCollected(order: OrderLean): Promise<void> {
  const updated = await Order.findOneAndUpdate(
    { _id: order._id, status: { $in: ["placed", "assigned"] } },
    { $set: { status: "picked_up", "timeline.pickedUpAt": new Date() } },
    { new: true },
  ).lean<OrderLean>();
  if (!updated) return;
  await broadcastOrder(updated);
  if (updated.userId) {
    await notify(updated.userId, {
      kind: "order",
      title: "Your order left the fridge",
      body: "The courier has collected it and is heading your way.",
      href: `/orders/${String(updated._id)}`,
    });
  }
}

async function recordWalkUp(machineId: string, data: MachineEventOf<"vend.completed">["data"]): Promise<void> {
  const products = new Map((await Product.find({ sku: { $in: data.items.map((i) => i.sku) } }).lean()).map((p) => [p.sku, p]));
  const total = data.items.reduce((sum, i) => sum + i.unitPriceCents * i.qty, 0);
  const method = data.payment?.method === "cash" ? "machine_cash" : "machine_card";
  const order = await Order.create({
    number: newWalkUpNumber(),
    machineId,
    channel: "machine",
    fulfillment: "walk_up",
    status: "completed",
    payment: { method, status: "paid", paidAt: new Date(), reference: data.payment?.reference },
    items: data.items.map((i) => {
      const p = products.get(i.sku);
      return {
        productId: p?._id ?? new Types.ObjectId(),
        sku: i.sku,
        name: p?.name ?? i.sku,
        category: p?.category ?? "salad",
        qty: i.qty,
        unitPriceCents: i.unitPriceCents,
        listPriceCents: i.unitPriceCents,
        nutrition: p ? { kcal: p.nutrition.kcal, proteinG: p.nutrition.proteinG, carbsG: p.nutrition.carbsG, fatG: p.nutrition.fatG } : undefined,
      };
    }),
    totals: { subtotalCents: total, totalCents: total },
    timeline: { completedAt: new Date() },
  });
  await Payment.create({
    orderId: order._id,
    purpose: "order",
    method,
    provider: "machine",
    amountCents: total,
    status: "succeeded",
    providerRef: data.payment?.reference ?? data.vendId,
  });
  const machine = await getMachine(machineId);
  const names = order.items.map((i) => i.name).join(", ");
  feed("order", `Walk-up sale at ${machine?.name ?? machineId}: ${names} · ${formatEgp(total)}`);
  publish("admin", { type: "order", order: await toOrderDTO(order.toObject() as OrderLean, { withCustomer: true }) });
}

// ------------------------------------------------------------------ pricing + quotes

type PricedLine = { product: ProductDoc; qty: number };

function priceLines(args: {
  machine: MachineLean;
  user: Pick<UserDoc, "student"> | null;
  lines: PricedLine[];
  delivery: { lat: number; lng: number } | null;
  settings: Settings;
  now: Date;
}): { quote: Quote; km: number } {
  const { machine, user, lines, delivery, settings, now } = args;
  const [mLng, mLat] = machine.location.coordinates;
  const km = delivery ? Math.round(distanceKm({ lat: mLat, lng: mLng }, delivery) * 10) / 10 : 0;
  const expiries = new Map((machine.stock ?? []).map((s) => [s.sku, s.nearestExpiry ? new Date(s.nearestExpiry) : null]));
  const pricingItems = lines.map(({ product, qty }) => ({
    product: { productId: String(product._id), sku: product.sku, name: product.name, category: product.category, priceCents: product.priceCents },
    qty,
  }));
  const ctx = { now, expiries, isStudent: Boolean(user?.student?.verified) };
  const goods = quoteCart(pricingItems, ctx, settings.pricing);
  const quote = delivery
    ? quoteCart(pricingItems, { ...ctx, deliveryFeeCents: deliveryFee(km, goods.totalCents, settings.delivery) }, settings.pricing)
    : goods;
  return { quote, km };
}

export const QuoteRequestSchema = z.object({
  machineId: z.string().min(1),
  items: z.array(z.object({ sku: z.string().min(3), qty: z.number().int().min(1).max(5) })).min(1).max(10),
  fulfillment: z.enum(["pickup", "delivery"]),
  delivery: z.object({ lat: z.number(), lng: z.number() }).optional(),
});

export type CheckoutQuote = {
  machine: { id: string; name: string; isSelling: boolean };
  lines: { sku: string; name: string; category: string; qty: number; unitCents: number; listCents: number; label: string | null; available: number }[];
  listTotalCents: number;
  itemsTotalCents: number;
  comboDiscountCents: number;
  studentDiscountCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  promos: string[];
  km: number;
  holdMinutes: number;
  problems: string[];
};

/** Server-side price for the checkout screen — never trust a total computed in the browser. */
export async function quoteOrder(userId: string | null, input: z.infer<typeof QuoteRequestSchema>): Promise<CheckoutQuote> {
  const [settings, machine, user] = await Promise.all([
    getSettings(),
    getMachine(input.machineId),
    userId ? User.findById(userId, { student: 1 }).lean<UserDoc>() : null,
  ]);
  if (!machine) throw Errors.notFound("Fridge");
  const products = await productsBySku(input.items.map((i) => i.sku));
  const lines = input.items.flatMap((i) => {
    const product = products.get(i.sku);
    return product ? [{ product, qty: i.qty }] : [];
  });
  const isDelivery = input.fulfillment === "delivery";
  const { quote, km } = priceLines({
    machine,
    user,
    lines,
    delivery: isDelivery && input.delivery ? input.delivery : null,
    settings,
    now: new Date(),
  });

  const problems: string[] = [];
  if (!isSelling(machine)) problems.push(`${machine.name} isn't selling right now.`);
  const availability = new Map((machine.stock ?? []).map((s) => [s.sku, Math.max(0, s.onHand - s.held)]));
  for (const { product, qty } of lines) {
    const available = availability.get(product.sku) ?? 0;
    if (available < qty) problems.push(available === 0 ? `${product.name} is sold out here.` : `Only ${available} × ${product.name} left here.`);
  }
  if (isDelivery && km > settings.delivery.maxKm) problems.push(`Too far for delivery (${km} km, max ${settings.delivery.maxKm} km).`);

  return {
    machine: { id: machine._id, name: machine.name, isSelling: isSelling(machine) },
    lines: quote.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      category: l.category,
      qty: l.qty,
      unitCents: l.unitCents,
      listCents: l.listCents,
      label: l.label,
      available: availability.get(l.sku) ?? 0,
    })),
    listTotalCents: quote.listTotalCents,
    itemsTotalCents: quote.itemsTotalCents,
    comboDiscountCents: quote.comboDiscountCents,
    studentDiscountCents: quote.studentDiscountCents,
    discountCents: quote.discountCents,
    deliveryFeeCents: quote.deliveryFeeCents,
    totalCents: quote.totalCents,
    promos: quote.promos,
    km,
    holdMinutes: isDelivery ? settings.delivery.holdMinutes : settings.reservation.holdMinutes,
    problems,
  };
}

// ------------------------------------------------------------------ helpers

function assertSelling(machine: MachineLean) {
  if (isSelling(machine)) return;
  const message = machine.isSeasonal
    ? `${machine.name} is closed for the season.`
    : machine.salesLocked
      ? `${machine.name} paused sales for a moment (temperature check). Try another fridge.`
      : `${machine.name} is ${machine.status} right now.`;
  throw new AppError("machine_unavailable", message, 423);
}

export async function releaseHoldQuietly(machineId: string, holdId: string): Promise<void> {
  try {
    await machineGateway.releaseHold(machineId, holdId);
  } catch {
    // Machine unreachable: the hold expires on the machine by itself.
  }
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;
}
