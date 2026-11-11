import "server-only";
import { startOfCairoDay } from "@/lib/dates";
import { Issue, Machine, Order, Product, User, type IMachine, type IProduct } from "./db/models";
import { toMachineDTO, type MachineLean } from "./machines/service";
import { recentFeed } from "./notifications";
import { toOrderDTOs, type OrderLean } from "./orders/service";
import { tierFor } from "./loyalty/rules";

/** Read models for the admin dashboard. */

const ACTIVE = ["reserved", "placed", "assigned", "picked_up", "on_the_way"];
const FULFILLED = ["completed", "delivered"];

export async function overview() {
  const since = startOfCairoDay();
  const [todayOrders, machines, products, openIssues, newCustomers, topProducts] = await Promise.all([
    Order.find({ createdAt: { $gte: since } }).lean<OrderLean[]>(),
    Machine.find().lean<MachineLean[]>(),
    Product.find({}, { sku: 1, name: 1 }).lean<Pick<IProduct, "sku" | "name">[]>(),
    Issue.countDocuments({ status: "open" }),
    User.countDocuments({ createdAt: { $gte: since }, role: "customer" }),
    Order.aggregate<{ _id: string; qty: number; revenueCents: number }>([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 86_400_000) }, status: { $in: [...FULFILLED, ...ACTIVE] } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.name", qty: { $sum: "$items.qty" }, revenueCents: { $sum: { $multiply: ["$items.qty", "$items.unitPriceCents"] } } } },
      { $sort: { qty: -1 } },
      { $limit: 6 },
    ]),
  ]);

  const counted = todayOrders.filter((o) => [...FULFILLED, ...ACTIVE].includes(o.status));
  const paid = counted.filter((o) => o.payment.status === "paid");
  const revenueCents = paid.reduce((s, o) => s + o.totals.totalCents, 0);
  const appRevenueCents = paid.filter((o) => o.channel === "app").reduce((s, o) => s + o.totals.totalCents, 0);

  const byHour = Array.from({ length: 24 }, (_, h) => ({ hour: h, label: `${h}:00`, orders: 0, revenue: 0 }));
  for (const o of counted) {
    const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }).format(o.createdAt)) % 24;
    byHour[h]!.orders += 1;
    byHour[h]!.revenue += o.totals.totalCents / 100;
  }
  const firstHour = Math.min(8, ...counted.map((o) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", hour12: false }).format(o.createdAt)) % 24));

  const names = new Map(products.map((p) => [p.sku, p.name]));
  const fleet = machines.filter((m) => !m.isSeasonal);
  const lowStock = fleet
    .filter((m) => m.status === "online")
    .flatMap((m) =>
      (m.stock ?? [])
        .map((s) => ({ machine: m.name, machineId: m._id, sku: s.sku, product: names.get(s.sku) ?? s.sku, available: Math.max(0, s.onHand - s.held), held: s.held }))
        .filter((s) => s.available <= 1),
    )
    .sort((a, b) => a.available - b.available)
    .slice(0, 10);

  const alerts = fleet
    .filter((m) => m.status !== "online" || m.salesLocked || m.notice)
    .map((m) => ({
      machine: m.name,
      machineId: m._id,
      text:
        m.status !== "online"
          ? `Machine ${m.status}`
          : m.salesLocked
            ? `Sales paused — cabinet at ${m.temperatureC.toFixed(1)}°C`
            : `Notice: “${m.notice}”`,
      severity: m.status !== "online" || m.salesLocked ? "high" : "info",
    }));

  return {
    kpis: {
      ordersToday: counted.length,
      revenueCents,
      appSharePercent: revenueCents ? Math.round((appRevenueCents / revenueCents) * 100) : 0,
      avgBasketCents: paid.length ? Math.round(revenueCents / paid.length) : 0,
      activeHolds: todayOrders.filter((o) => o.status === "reserved").length,
      activeDeliveries: todayOrders.filter((o) => ["placed", "assigned", "picked_up", "on_the_way"].includes(o.status)).length,
      machinesOnline: fleet.filter((m) => m.status === "online" && !m.salesLocked).length,
      machinesTotal: fleet.length,
      lowStock: lowStock.length,
      openIssues,
      newCustomers,
    },
    salesByHour: byHour.slice(firstHour, 24),
    lowStock,
    alerts,
    topProducts: topProducts.map((t) => ({ name: t._id, qty: t.qty, revenueCents: t.revenueCents })),
    feed: recentFeed(),
  };
}

export async function machinesWithStock() {
  const [machines, products] = await Promise.all([
    Machine.find().sort({ isSeasonal: 1, name: 1 }).lean<MachineLean[]>(),
    Product.find({}, { sku: 1, name: 1, category: 1 }).lean<Pick<IProduct, "sku" | "name" | "category">[]>(),
  ]);
  const names = new Map(products.map((p) => [p.sku, p.name]));
  return machines.map((m) => ({
    ...toMachineDTO(m),
    lastSyncAt: m.lastSyncAt ? new Date(m.lastSyncAt).toISOString() : null,
    stock: (m.stock ?? [])
      .map((s: IMachine["stock"][number]) => ({
        sku: s.sku,
        name: names.get(s.sku) ?? s.sku,
        onHand: s.onHand,
        held: s.held,
        available: Math.max(0, s.onHand - s.held),
        slots: s.slots,
        nearestExpiry: s.nearestExpiry ? new Date(s.nearestExpiry).toISOString() : null,
      }))
      .sort((a, b) => a.available - b.available),
  }));
}

export async function adminOrders(filter: { status?: string; fulfillment?: string } = {}) {
  const query: Record<string, unknown> = {};
  if (filter.status === "active") query.status = { $in: ACTIVE };
  else if (filter.status) query.status = filter.status;
  if (filter.fulfillment) query.fulfillment = filter.fulfillment;
  const orders = await Order.find(query).sort({ createdAt: -1 }).limit(80).lean<OrderLean[]>();
  return toOrderDTOs(orders, { withCustomer: true });
}

export async function deliveryBoard() {
  const since = startOfCairoDay();
  const orders = await Order.find({
    fulfillment: "delivery",
    $or: [{ status: { $in: ["placed", "assigned", "picked_up", "on_the_way"] } }, { createdAt: { $gte: since } }],
  })
    .sort({ createdAt: -1 })
    .limit(60)
    .lean<OrderLean[]>();
  return toOrderDTOs(orders, { withCustomer: true });
}

export async function customers() {
  const [users, stats] = await Promise.all([
    User.find({ role: "customer" }).sort({ createdAt: -1 }).limit(100).lean(),
    Order.aggregate<{ _id: unknown; orders: number; spendCents: number; lastAt: Date }>([
      { $match: { userId: { $ne: null }, status: { $in: FULFILLED } } },
      { $group: { _id: "$userId", orders: { $sum: 1 }, spendCents: { $sum: "$totals.totalCents" }, lastAt: { $max: "$createdAt" } } },
    ]),
  ]);
  const byUser = new Map(stats.map((s) => [String(s._id), s]));
  return users.map((u) => {
    const s = byUser.get(String(u._id));
    return {
      id: String(u._id),
      name: u.name,
      phone: u.phone,
      tier: tierFor(u.loyalty?.lifetimePoints ?? 0).tier.name,
      points: u.loyalty?.points ?? 0,
      walletCents: u.walletCents ?? 0,
      streak: u.loyalty?.streakCount ?? 0,
      student: Boolean(u.student?.verified),
      orders: s?.orders ?? 0,
      spendCents: s?.spendCents ?? 0,
      lastOrderAt: s?.lastAt ? s.lastAt.toISOString() : null,
      joinedAt: u.createdAt.toISOString(),
    };
  });
}

export async function productsWithStock() {
  const [products, machines] = await Promise.all([
    Product.find().sort({ sortOrder: 1 }).lean<IProduct[]>(),
    Machine.find({ isSeasonal: false }, { stock: 1 }).lean<Pick<IMachine, "_id" | "stock">[]>(),
  ]);
  const totals = new Map<string, number>();
  for (const m of machines) for (const s of m.stock ?? []) totals.set(s.sku, (totals.get(s.sku) ?? 0) + Math.max(0, s.onHand - s.held));
  return products.map((p) => ({
    id: String(p._id),
    sku: p.sku,
    name: p.name,
    category: p.category,
    priceCents: p.priceCents,
    kcal: p.nutrition.kcal,
    proteinG: p.nutrition.proteinG,
    macrosSource: p.nutrition.source,
    isActive: p.isActive,
    isNewArrival: p.isNewArrival,
    unitsInFleet: totals.get(p.sku) ?? 0,
    art: p.art,
  }));
}
