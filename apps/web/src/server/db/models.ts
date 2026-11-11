import "server-only";
import mongoose, { Schema, model, type Model, type Types } from "mongoose";

/**
 * MongoDB collections. Modelled around how the app reads data:
 * - a machine document embeds its stock (one read per fridge, atomic updates per SKU)
 * - an order embeds its items and delivery details
 * - wallet + points are append-only ledgers; the user document caches the balances
 * Each collection has an explicit interface (the documented shape) passed to its Schema.
 */

function defineModel<T>(name: string, schema: Schema<T>, collection: string): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? model<T>(name, schema, collection);
}

type Timestamps = { createdAt: Date; updatedAt: Date };

// ================================================================ users

export interface IAddress {
  _id: Types.ObjectId;
  label: string;
  line1: string;
  lat: number;
  lng: number;
  notes?: string | null;
}

export interface IUser extends Timestamps {
  _id: Types.ObjectId;
  phone: string;
  name: string;
  email?: string | null;
  role: "customer" | "admin";
  profile: {
    sex?: "female" | "male" | null;
    birthYear?: number | null;
    heightCm?: number | null;
    weightKg?: number | null;
    activityLevel: "sedentary" | "light" | "moderate" | "active" | "athlete";
    goal: "lose" | "maintain" | "gain";
    dietPrefs: string[];
    allergens: string[];
  };
  /** Optional manual overrides of the computed daily targets. */
  targets?: { kcal?: number | null; proteinG?: number | null; carbsG?: number | null; fatG?: number | null } | null;
  student?: { email?: string | null; verified: boolean } | null;
  favoriteMachineId?: string | null;
  referralCode: string;
  /** Who invited this member; both get wallet credit after the first fulfilled order. */
  referredBy?: Types.ObjectId | null;
  referralRewarded?: boolean;
  addresses: IAddress[];
  walletCents: number;
  loyalty: {
    points: number;
    lifetimePoints: number;
    streakCount: number;
    streakBest: number;
    streakLastDate?: string | null; // yyyy-mm-dd, Africa/Cairo
    stampCount: number;
  };
}

const AddressSchema = new Schema<IAddress>({
  label: { type: String, required: true },
  line1: { type: String, required: true },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  notes: String,
});

const UserSchema = new Schema<IUser>(
  {
    phone: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: String,
    role: { type: String, enum: ["customer", "admin"], default: "customer" },
    profile: {
      sex: { type: String, enum: ["female", "male", null] },
      birthYear: Number,
      heightCm: Number,
      weightKg: Number,
      activityLevel: { type: String, enum: ["sedentary", "light", "moderate", "active", "athlete"], default: "moderate" },
      goal: { type: String, enum: ["lose", "maintain", "gain"], default: "maintain" },
      dietPrefs: { type: [String], default: [] },
      allergens: { type: [String], default: [] },
    },
    targets: { kcal: Number, proteinG: Number, carbsG: Number, fatG: Number },
    student: { email: String, verified: { type: Boolean, default: false } },
    favoriteMachineId: String,
    referralCode: { type: String, required: true, unique: true },
    referredBy: { type: Schema.Types.ObjectId, ref: "User" },
    referralRewarded: { type: Boolean, default: false },
    addresses: { type: [AddressSchema], default: [] },
    walletCents: { type: Number, default: 0, min: 0 },
    loyalty: {
      points: { type: Number, default: 0, min: 0 },
      lifetimePoints: { type: Number, default: 0 },
      streakCount: { type: Number, default: 0 },
      streakBest: { type: Number, default: 0 },
      streakLastDate: String,
      stampCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

export const User = defineModel("User", UserSchema, "users");
export type UserDoc = IUser;

// ================================================================ catalog

export interface IProduct extends Timestamps {
  _id: Types.ObjectId;
  sku: string;
  slug: string;
  name: string;
  shortName: string;
  category: "salad" | "wrap" | "sandwich" | "bowl" | "dessert" | "drink" | "snack";
  description: string;
  ingredients: string[];
  /** Menu price in piasters — what the machine charges. */
  priceCents: number;
  nutrition: { kcal: number; proteinG: number; carbsG: number; fatG: number; weightG: number; source: "label" | "estimate" };
  tags: string[];
  allergens: string[];
  art: { layers: string[]; accent: string };
  isActive: boolean;
  isNewArrival: boolean;
  sortOrder: number;
}

const ProductSchema = new Schema<IProduct>(
  {
    sku: { type: String, required: true, unique: true },
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    shortName: { type: String, required: true },
    category: { type: String, enum: ["salad", "wrap", "sandwich", "bowl", "dessert", "drink", "snack"], required: true },
    description: { type: String, required: true },
    ingredients: { type: [String], default: [] },
    priceCents: { type: Number, required: true, min: 0 },
    nutrition: {
      kcal: { type: Number, required: true },
      proteinG: { type: Number, required: true },
      carbsG: { type: Number, required: true },
      fatG: { type: Number, required: true },
      weightG: { type: Number, required: true },
      source: { type: String, enum: ["label", "estimate"], required: true },
    },
    tags: { type: [String], default: [] },
    allergens: { type: [String], default: [] },
    art: { layers: { type: [String], default: [] }, accent: { type: String, default: "#1F5A34" } },
    isActive: { type: Boolean, default: true },
    isNewArrival: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);
ProductSchema.index({ isActive: 1, sortOrder: 1 });
ProductSchema.index({ name: "text", description: "text", ingredients: "text" });

export const Product = defineModel("Product", ProductSchema, "products");
export type ProductDoc = IProduct;

// ================================================================ machines

export interface IStock {
  sku: string;
  onHand: number;
  held: number;
  slots: string[];
  nearestExpiry?: Date | null;
}

export interface IMachine extends Timestamps {
  _id: string; // same id as the physical machine
  name: string;
  venue: string;
  area: string;
  address: string;
  location: { type: "Point"; coordinates: [number, number] }; // [lng, lat]
  kind: "campus" | "office" | "beach";
  hours: string;
  isSeasonal: boolean;
  status: "online" | "offline" | "maintenance";
  temperatureC: number;
  salesLocked: boolean;
  notice?: string | null;
  stock: IStock[];
  lastSeenAt?: Date | null;
  lastSyncAt?: Date | null;
}

const StockSchema = new Schema<IStock>(
  {
    sku: { type: String, required: true },
    onHand: { type: Number, default: 0, min: 0 },
    held: { type: Number, default: 0, min: 0 },
    slots: { type: [String], default: [] },
    nearestExpiry: Date,
  },
  { _id: false },
);

const MachineSchema = new Schema<IMachine>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    venue: { type: String, required: true },
    area: { type: String, required: true },
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true },
    },
    kind: { type: String, enum: ["campus", "office", "beach"], required: true },
    hours: { type: String, required: true },
    isSeasonal: { type: Boolean, default: false },
    status: { type: String, enum: ["online", "offline", "maintenance"], default: "online" },
    temperatureC: { type: Number, default: 4 },
    salesLocked: { type: Boolean, default: false },
    notice: { type: String, default: null },
    stock: { type: [StockSchema], default: [] },
    lastSeenAt: Date,
    lastSyncAt: Date,
  },
  { timestamps: true },
);
MachineSchema.index({ location: "2dsphere" });
MachineSchema.index({ "stock.sku": 1 });

export const Machine = defineModel("Machine", MachineSchema, "machines");
export type MachineDoc = IMachine;

// ================================================================ orders

export interface IOrderItem {
  productId: Types.ObjectId;
  sku: string;
  name: string;
  category: string;
  qty: number;
  unitPriceCents: number;
  listPriceCents: number;
  discountLabel?: string | null;
  nutrition?: { kcal: number; proteinG: number; carbsG: number; fatG: number } | null;
}

export const ORDER_STATUSES = [
  "reserved",
  "completed",
  "expired",
  "cancelled",
  "failed",
  "placed",
  "assigned",
  "picked_up",
  "on_the_way",
  "delivered",
] as const;

export interface IOrder extends Timestamps {
  _id: Types.ObjectId;
  number: string;
  userId?: Types.ObjectId | null;
  machineId: string;
  channel: "app" | "machine";
  fulfillment: "pickup" | "delivery" | "walk_up";
  status: (typeof ORDER_STATUSES)[number];
  payment: {
    method: "wallet" | "card" | "pay_at_fridge" | "cash" | "machine_card" | "machine_cash";
    status: "unpaid" | "paid" | "refunded";
    paidAt?: Date | null;
    reference?: string | null;
  };
  items: IOrderItem[];
  totals: { subtotalCents: number; discountCents: number; deliveryFeeCents: number; totalCents: number };
  promos: string[];
  pointsEarned: number;
  pickupCode?: string | null;
  hold?: { id?: string | null; expiresAt?: Date | null } | null;
  idempotencyKey?: string | null;
  delivery?: {
    address?: string | null;
    lat?: number | null;
    lng?: number | null;
    km?: number | null;
    driverId?: Types.ObjectId | null;
    courierCode?: string | null;
    etaAt?: Date | null;
  } | null;
  timeline: {
    reservedAt?: Date | null;
    placedAt?: Date | null;
    assignedAt?: Date | null;
    pickedUpAt?: Date | null;
    onTheWayAt?: Date | null;
    deliveredAt?: Date | null;
    completedAt?: Date | null;
    cancelledAt?: Date | null;
    expiredAt?: Date | null;
  };
  failureReason?: string | null;
}

const OrderItemSchema = new Schema<IOrderItem>(
  {
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    sku: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPriceCents: { type: Number, required: true },
    listPriceCents: { type: Number, required: true },
    discountLabel: String,
    nutrition: { kcal: Number, proteinG: Number, carbsG: Number, fatG: Number },
  },
  { _id: false },
);

const OrderSchema = new Schema<IOrder>(
  {
    number: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    machineId: { type: String, required: true, ref: "Machine" },
    channel: { type: String, enum: ["app", "machine"], default: "app" },
    fulfillment: { type: String, enum: ["pickup", "delivery", "walk_up"], required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true },
    payment: {
      method: { type: String, enum: ["wallet", "card", "pay_at_fridge", "cash", "machine_card", "machine_cash"], required: true },
      status: { type: String, enum: ["unpaid", "paid", "refunded"], default: "unpaid" },
      paidAt: Date,
      reference: String,
    },
    items: { type: [OrderItemSchema], required: true },
    totals: {
      subtotalCents: { type: Number, required: true },
      discountCents: { type: Number, default: 0 },
      deliveryFeeCents: { type: Number, default: 0 },
      totalCents: { type: Number, required: true },
    },
    promos: { type: [String], default: [] },
    pointsEarned: { type: Number, default: 0 },
    pickupCode: String,
    hold: { id: String, expiresAt: Date },
    idempotencyKey: String,
    delivery: {
      address: String,
      lat: Number,
      lng: Number,
      km: Number,
      driverId: { type: Schema.Types.ObjectId, ref: "Driver" },
      courierCode: String,
      etaAt: Date,
    },
    timeline: {
      reservedAt: Date,
      placedAt: Date,
      assignedAt: Date,
      pickedUpAt: Date,
      onTheWayAt: Date,
      deliveredAt: Date,
      completedAt: Date,
      cancelledAt: Date,
      expiredAt: Date,
    },
    failureReason: String,
  },
  { timestamps: true },
);
OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, "hold.expiresAt": 1 });
OrderSchema.index({ machineId: 1, createdAt: -1 });
OrderSchema.index({ pickupCode: 1 }, { unique: true, partialFilterExpression: { pickupCode: { $type: "string" } } });
OrderSchema.index(
  { "delivery.courierCode": 1 },
  { unique: true, partialFilterExpression: { "delivery.courierCode": { $type: "string" } } },
);
OrderSchema.index(
  { userId: 1, idempotencyKey: 1 },
  { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } },
);

export const Order = defineModel("Order", OrderSchema, "orders");
export type OrderDoc = IOrder;

export interface IDriver {
  _id: Types.ObjectId;
  name: string;
  phone: string;
  vehicle: "scooter" | "bike" | "car";
  isActive: boolean;
}
const DriverSchema = new Schema<IDriver>({
  name: { type: String, required: true },
  phone: { type: String, required: true },
  vehicle: { type: String, enum: ["scooter", "bike", "car"], required: true },
  isActive: { type: Boolean, default: true },
});
export const Driver = defineModel("Driver", DriverSchema, "drivers");

// ================================================================ money + loyalty ledgers

export interface IPayment extends Timestamps {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | null;
  orderId?: Types.ObjectId | null;
  purpose: "topup" | "order";
  method: "card" | "instapay" | "fawry" | "mobile_wallet" | "machine_card" | "machine_cash" | "cash";
  provider: "sandbox" | "machine";
  amountCents: number;
  status: "succeeded" | "failed" | "refunded";
  providerRef: string;
}
const PaymentSchema = new Schema<IPayment>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    purpose: { type: String, enum: ["topup", "order"], required: true },
    method: { type: String, enum: ["card", "instapay", "fawry", "mobile_wallet", "machine_card", "machine_cash", "cash"], required: true },
    provider: { type: String, enum: ["sandbox", "machine"], required: true },
    amountCents: { type: Number, required: true },
    status: { type: String, enum: ["succeeded", "failed", "refunded"], required: true },
    providerRef: { type: String, required: true },
  },
  { timestamps: true },
);
PaymentSchema.index({ createdAt: -1 });
export const Payment = defineModel("Payment", PaymentSchema, "payments");

export interface IWalletTransaction {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: "topup" | "payment" | "refund" | "reward" | "adjustment";
  amountCents: number; // signed
  balanceAfterCents: number;
  description: string;
  orderId?: Types.ObjectId | null;
  paymentRef?: string | null;
  createdAt: Date;
}
const WalletTransactionSchema = new Schema<IWalletTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["topup", "payment", "refund", "reward", "adjustment"], required: true },
    amountCents: { type: Number, required: true },
    balanceAfterCents: { type: Number, required: true },
    description: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
    paymentRef: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
WalletTransactionSchema.index({ userId: 1, createdAt: -1 });
export const WalletTransaction = defineModel("WalletTransaction", WalletTransactionSchema, "wallet_transactions");

export interface IPointsTransaction {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  type: "earn" | "bonus" | "redeem" | "adjust";
  points: number; // signed
  reason: string;
  orderId?: Types.ObjectId | null;
  createdAt: Date;
}
const PointsTransactionSchema = new Schema<IPointsTransaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["earn", "bonus", "redeem", "adjust"], required: true },
    points: { type: Number, required: true },
    reason: { type: String, required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
PointsTransactionSchema.index({ userId: 1, createdAt: -1 });
export const PointsTransaction = defineModel("PointsTransaction", PointsTransactionSchema, "points_transactions");

export interface IReward {
  _id: Types.ObjectId;
  slug: string;
  name: string;
  description: string;
  costPoints: number;
  kind: "wallet_credit" | "merch";
  valueCents: number;
  isActive: boolean;
  sortOrder: number;
}
const RewardSchema = new Schema<IReward>({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  description: { type: String, required: true },
  costPoints: { type: Number, required: true },
  kind: { type: String, enum: ["wallet_credit", "merch"], required: true },
  valueCents: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
});
export const Reward = defineModel("Reward", RewardSchema, "rewards");

export interface IRewardRedemption {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  rewardId: Types.ObjectId;
  rewardName: string;
  code: string;
  status: "issued" | "used";
  createdAt: Date;
}
const RewardRedemptionSchema = new Schema<IRewardRedemption>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    rewardId: { type: Schema.Types.ObjectId, ref: "Reward", required: true },
    rewardName: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    status: { type: String, enum: ["issued", "used"], default: "issued" },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
export const RewardRedemption = defineModel("RewardRedemption", RewardRedemptionSchema, "reward_redemptions");

// ================================================================ nutrition

export interface INutritionLog {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  productId?: Types.ObjectId | null;
  name: string;
  qty: number;
  kcal: number; // totals for the row (already × qty)
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: "order" | "manual";
  orderId?: Types.ObjectId | null;
  eatenAt: Date;
}
const NutritionLogSchema = new Schema<INutritionLog>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  productId: { type: Schema.Types.ObjectId, ref: "Product" },
  name: { type: String, required: true },
  qty: { type: Number, default: 1 },
  kcal: { type: Number, required: true },
  proteinG: { type: Number, required: true },
  carbsG: { type: Number, required: true },
  fatG: { type: Number, required: true },
  source: { type: String, enum: ["order", "manual"], required: true },
  orderId: { type: Schema.Types.ObjectId, ref: "Order" },
  eatenAt: { type: Date, default: () => new Date() },
});
NutritionLogSchema.index({ userId: 1, eatenAt: -1 });
export const NutritionLog = defineModel("NutritionLog", NutritionLogSchema, "nutrition_logs");

// ================================================================ engagement

export interface IStockAlert {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  sku: string;
  productName: string;
  machineId?: string | null; // null = any fridge
  notifiedAt?: Date | null;
  createdAt: Date;
}
const StockAlertSchema = new Schema<IStockAlert>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    sku: { type: String, required: true },
    productName: { type: String, required: true },
    machineId: { type: String, default: null },
    notifiedAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
StockAlertSchema.index({ sku: 1, notifiedAt: 1 });
StockAlertSchema.index({ userId: 1, sku: 1, machineId: 1 }, { unique: true });
export const StockAlert = defineModel("StockAlert", StockAlertSchema, "stock_alerts");

export interface INotification {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  kind: "order" | "loyalty" | "stock" | "system";
  title: string;
  body: string;
  href?: string | null;
  readAt?: Date | null;
  createdAt: Date;
}
const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    kind: { type: String, enum: ["order", "loyalty", "stock", "system"], required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    href: String,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
NotificationSchema.index({ userId: 1, createdAt: -1 });
export const Notification = defineModel("Notification", NotificationSchema, "notifications");

export interface IIssue extends Timestamps {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  orderId: Types.ObjectId;
  orderNumber: string;
  kind: "not_dispensed" | "wrong_item" | "quality" | "other";
  message: string;
  status: "open" | "refunded" | "resolved" | "rejected";
  refundCents: number;
  resolvedAt?: Date | null;
}
const IssueSchema = new Schema<IIssue>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", required: true },
    orderNumber: { type: String, required: true },
    kind: { type: String, enum: ["not_dispensed", "wrong_item", "quality", "other"], required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ["open", "refunded", "resolved", "rejected"], default: "open" },
    refundCents: { type: Number, default: 0 },
    resolvedAt: Date,
  },
  { timestamps: true },
);
IssueSchema.index({ status: 1, createdAt: -1 });
export const Issue = defineModel("Issue", IssueSchema, "issues");

export interface IProductRequest extends Timestamps {
  _id: Types.ObjectId;
  userId?: Types.ObjectId | null;
  name: string;
  note?: string | null;
  voterIds: Types.ObjectId[];
  votes: number;
}
const ProductRequestSchema = new Schema<IProductRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    name: { type: String, required: true, maxlength: 80 },
    note: { type: String, maxlength: 280 },
    voterIds: { type: [Schema.Types.ObjectId], default: [] },
    votes: { type: Number, default: 0 },
  },
  { timestamps: true },
);
ProductRequestSchema.index({ votes: -1 });
export const ProductRequest = defineModel("ProductRequest", ProductRequestSchema, "product_requests");

// ================================================================ infrastructure

/** Inbox of processed machine webhooks — duplicate deliveries are ignored. Auto-expires after 7 days. */
export interface IMachineEvent {
  _id: string;
  machineId: string;
  type: string;
  receivedAt: Date;
}
const MachineEventSchema = new Schema<IMachineEvent>({
  _id: { type: String, required: true },
  machineId: { type: String, required: true },
  type: { type: String, required: true },
  receivedAt: { type: Date, default: () => new Date() },
});
MachineEventSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
export const MachineEventInbox = defineModel("MachineEvent", MachineEventSchema, "machine_events");

export interface ISetting {
  _id: string;
  value: unknown;
}
const SettingSchema = new Schema<ISetting>(
  {
    _id: { type: String, required: true },
    value: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
export const Setting = defineModel("Setting", SettingSchema, "settings");
