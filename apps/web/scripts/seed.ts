/**
 * Seeds MongoDB with The Fridge's menu, machines, rewards, drivers, settings and two demo accounts.
 *   npm run db:seed            → upsert reference data, keep orders/users
 *   npm run db:reset           → drop this app's collections first, then seed
 * Safety: refuses to touch any database whose name doesn't end in "_demo".
 */
import mongoose, { Types } from "mongoose";
import { MACHINES, PRODUCTS, buildPlanogram, summarizePlanogram } from "@thefridge/shared/fixtures";
import { addDays, cairoDay, startOfCairoDay, weekday, WEEKEND_DAYS } from "../src/lib/dates";
import { connectDb } from "../src/server/db/mongo";
import * as models from "../src/server/db/models";
import { DEMO_ACCOUNTS } from "../src/server/demo-accounts";
import { advanceStreak, pointsForSpend } from "../src/server/loyalty/rules";
import { SettingsSchema } from "../src/server/settings";

const {
  Driver, Machine, NutritionLog, Order, PointsTransaction, Product, ProductRequest, Reward, Setting, User, WalletTransaction,
} = models;

const RESET = process.argv.includes("--reset");

async function main() {
  const conn = await connectDb();
  const dbName = conn.connection.db?.databaseName ?? "";
  if (!dbName.endsWith("_demo")) {
    throw new Error(`Refusing to seed database "${dbName}": only databases ending in "_demo" are allowed.`);
  }
  console.log(`Seeding ${dbName}${RESET ? " (reset)" : ""}…`);

  const allModels = Object.values(models).filter((m): m is mongoose.Model<any> => typeof m === "function" && "collection" in m);
  if (RESET) {
    for (const model of allModels) await model.deleteMany({});
  }
  for (const model of allModels) await model.syncIndexes();

  // Products
  for (const [index, p] of PRODUCTS.entries()) {
    await Product.updateOne(
      { sku: p.sku },
      {
        $set: {
          slug: p.slug,
          name: p.name,
          shortName: p.shortName,
          category: p.category,
          description: p.description,
          ingredients: p.ingredients,
          priceCents: p.priceCents,
          nutrition: { kcal: p.kcal, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG, weightG: p.weightG, source: p.macrosSource },
          tags: p.tags,
          allergens: p.allergens,
          art: p.art,
          isNewArrival: Boolean(p.isNew),
          isActive: true,
          sortOrder: index,
        },
      },
      { upsert: true },
    );
  }

  // Machines — stock starts from the same planogram the simulator uses; the live sync takes over after.
  const now = new Date();
  for (const m of MACHINES) {
    const stock = summarizePlanogram(buildPlanogram(m.id, now)).map((s) => ({
      sku: s.sku,
      onHand: s.onHand,
      held: 0,
      slots: s.slots,
      nearestExpiry: s.nearestExpiry ? new Date(s.nearestExpiry) : undefined,
    }));
    await Machine.updateOne(
      { _id: m.id },
      {
        $set: {
          name: m.name,
          venue: m.venue,
          area: m.area,
          address: m.address,
          location: { type: "Point", coordinates: [m.lng, m.lat] },
          kind: m.kind,
          hours: m.hours,
          isSeasonal: m.isSeasonal,
          status: m.isSeasonal ? "offline" : "online",
          salesLocked: m.isSeasonal,
          temperatureC: m.isSeasonal ? 23.5 : 4,
          notice: m.notice,
          stock,
          lastSeenAt: now,
        },
      },
      { upsert: true },
    );
  }

  // Rewards
  const rewards = [
    { slug: "credit-25", name: "EGP 25 wallet credit", description: "A little something towards your next meal.", costPoints: 500, kind: "wallet_credit", valueCents: 2500 },
    { slug: "credit-60", name: "EGP 60 wallet credit", description: "Best value — about a third of a salad.", costPoints: 1000, kind: "wallet_credit", valueCents: 6000 },
    { slug: "tote-bag", name: "The Fridge tote bag", description: "Our canvas tote with the mascot on it. Collect it at any fridge.", costPoints: 1500, kind: "merch", valueCents: 0 },
    { slug: "credit-170", name: "A salad on us (EGP 170)", description: "Enough for any salad on the menu.", costPoints: 2800, kind: "wallet_credit", valueCents: 17000 },
  ];
  for (const [index, r] of rewards.entries()) {
    await Reward.updateOne({ slug: r.slug }, { $set: { ...r, isActive: true, sortOrder: index } }, { upsert: true });
  }

  // Drivers
  if ((await Driver.countDocuments()) === 0) {
    await Driver.insertMany([
      { name: "Youssef Samir", phone: "+201000000101", vehicle: "scooter" },
      { name: "Mariam Fathy", phone: "+201000000102", vehicle: "scooter" },
      { name: "Omar Khaled", phone: "+201000000103", vehicle: "bike" },
      { name: "Hana Mostafa", phone: "+201000000104", vehicle: "car" },
    ]);
  }

  // Settings (defaults)
  if (!(await Setting.exists({ _id: "app" }))) {
    await Setting.create({ _id: "app", value: SettingsSchema.parse({}) });
  }

  // Demo accounts
  await User.updateOne(
    { phone: DEMO_ACCOUNTS.admin.phone },
    { $setOnInsert: { name: DEMO_ACCOUNTS.admin.name, role: "admin", referralCode: "OPSADMIN" } },
    { upsert: true },
  );
  const customerExists = await User.exists({ phone: DEMO_ACCOUNTS.customer.phone });
  if (!customerExists) await seedDemoCustomer();

  // Product requests (members' votes guide the next restock)
  if ((await ProductRequest.countDocuments()) === 0) {
    await ProductRequest.insertMany([
      { name: "Overnight oats", note: "For 8 am lectures", votes: 23 },
      { name: "Greek yogurt & granola cup", votes: 17 },
      { name: "Iced matcha latte", votes: 12 },
      { name: "Grilled salmon bowl", note: "Even at a higher price", votes: 9 },
    ]);
  }

  console.log(`✔ ${PRODUCTS.length} products, ${MACHINES.length} machines, ${rewards.length} rewards, demo accounts ready.`);
}

/** A returning customer with a few days of history, so Home has real progress to show. */
async function seedDemoCustomer() {
  const user = await User.create({
    phone: DEMO_ACCOUNTS.customer.phone,
    name: DEMO_ACCOUNTS.customer.name,
    email: "nour@example.com",
    referralCode: "NOURFRIDGE",
    favoriteMachineId: "cbp-zayed",
    profile: { sex: "female", birthYear: 2001, heightCm: 166, weightKg: 61, activityLevel: "active", goal: "maintain", dietPrefs: ["high-protein"], allergens: [] },
    addresses: [{ label: "Office", line1: "Building B2, Capital Business Park, Sheikh Zayed", lat: 30.0319, lng: 31.0101 }],
  });

  let balance = 0;
  const ledger = async (type: "topup" | "payment", amountCents: number, description: string, createdAt: Date, orderId?: Types.ObjectId) => {
    balance += amountCents;
    await WalletTransaction.create({ userId: user._id, type, amountCents, balanceAfterCents: balance, description, orderId, createdAt });
  };

  const today = cairoDay();
  await ledger("topup", 150000, "Top-up via InstaPay", new Date(startOfCairoDay().getTime() - 7 * 86_400_000 + 9 * 3_600_000));

  // Meals on recent weekdays (Fri/Sat skipped — the streak survives weekends).
  const menu = new Map(PRODUCTS.map((p) => [p.sku, p]));
  const plan = [
    { daysAgo: 6, skus: ["SAL-CAESAR"] },
    { daysAgo: 5, skus: ["SAL-TACO", "DRK-LEMONADE"] },
    { daysAgo: 4, skus: ["BWL-CHIPOTLE"] },
    { daysAgo: 3, skus: ["SAL-BURGER"] },
    { daysAgo: 2, skus: ["SAL-CAESAR"] },
    { daysAgo: 1, skus: ["WRP-TERIYAKI", "SNK-POWER-BITES"] },
  ].filter((d) => !(WEEKEND_DAYS as readonly number[]).includes(weekday(addDays(today, -d.daysAgo))));

  let streak = { count: 0, best: 0, lastDate: null as string | null };
  let points = 100; // welcome bonus
  await PointsTransaction.create({ userId: user._id, type: "bonus", points: 100, reason: "Welcome to The Fridge" });

  for (const [n, day] of plan.entries()) {
    const date = addDays(today, -day.daysAgo);
    const at = new Date(startOfCairoDay(new Date(`${date}T12:00:00Z`)).getTime() + 13 * 3_600_000 + n * 60_000);
    const items = day.skus.map((sku) => {
      const p = menu.get(sku)!;
      const unit = Math.round((p.priceCents * 0.95) / 100) * 100;
      return {
        productId: new Types.ObjectId(),
        sku,
        name: p.name,
        category: p.category,
        qty: 1,
        unitPriceCents: unit,
        listPriceCents: p.priceCents,
        discountLabel: "App price",
        nutrition: { kcal: p.kcal, proteinG: p.proteinG, carbsG: p.carbsG, fatG: p.fatG },
      };
    });
    const products = await Product.find({ sku: { $in: day.skus } }, { sku: 1 }).lean();
    for (const item of items) item.productId = products.find((p) => p.sku === item.sku)!._id;

    const total = items.reduce((s, i) => s + i.unitPriceCents, 0);
    const list = items.reduce((s, i) => s + i.listPriceCents, 0);
    const orderId = new Types.ObjectId();
    const earned = pointsForSpend(total, 1, 1);
    streak = advanceStreak(streak, date, { weekendFreeze: true, milestones: [] });

    await Order.create({
      _id: orderId,
      number: `TF-H${n}${date.slice(8)}`,
      userId: user._id,
      machineId: "cbp-zayed",
      channel: "app",
      fulfillment: "pickup",
      status: "completed",
      payment: { method: "wallet", status: "paid", paidAt: at },
      items,
      totals: { subtotalCents: list, discountCents: list - total, deliveryFeeCents: 0, totalCents: total },
      promos: ["App price"],
      pointsEarned: earned,
      hold: { id: `hold_seed_${n}`, expiresAt: new Date(at.getTime() + 15 * 60_000) },
      timeline: { reservedAt: new Date(at.getTime() - 9 * 60_000), completedAt: at },
      createdAt: new Date(at.getTime() - 9 * 60_000),
    });
    await ledger("payment", -total, `Order TF-H${n}${date.slice(8)} · Capital Business Park`, at, orderId);
    await PointsTransaction.create({ userId: user._id, type: "earn", points: earned, reason: `Order TF-H${n}${date.slice(8)}`, orderId, createdAt: at });
    points += earned;
    await NutritionLog.insertMany(
      items.map((i) => ({
        userId: user._id,
        productId: i.productId,
        name: i.name,
        qty: 1,
        kcal: i.nutrition.kcal,
        proteinG: i.nutrition.proteinG,
        carbsG: i.nutrition.carbsG,
        fatG: i.nutrition.fatG,
        source: "order",
        orderId,
        eatenAt: at,
      })),
    );
  }

  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        walletCents: balance,
        "loyalty.points": points,
        "loyalty.lifetimePoints": points + 600, // pretend some earlier history
        "loyalty.streakCount": streak.count,
        "loyalty.streakBest": Math.max(streak.best, 9),
        "loyalty.streakLastDate": streak.lastDate,
        "loyalty.stampCount": Math.min(9, plan.length + 2),
      },
    },
  );
}

main()
  .then(() => mongoose.disconnect())
  .catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
  });
