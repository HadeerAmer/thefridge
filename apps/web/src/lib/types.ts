/** Data shapes the API sends to clients. Server code maps database documents to these. */

export type Category = "salad" | "wrap" | "sandwich" | "bowl" | "dessert" | "drink" | "snack";

export type Nutrition = { kcal: number; proteinG: number; carbsG: number; fatG: number };

export type StockAtMachine = {
  machineId: string;
  available: number;
  onHand: number;
  held: number;
  nearestExpiry: string | null;
};

export type PromoKind = "app" | "happy_hour" | "fresh_saver";

export type ProductDTO = {
  id: string;
  sku: string;
  slug: string;
  name: string;
  shortName: string;
  category: Category;
  description: string;
  ingredients: string[];
  allergens: string[];
  /** Diet tags + macro tags derived from nutrition (high-protein, low-carb, light). */
  tags: string[];
  /** Menu price — what the machine charges. */
  priceCents: number;
  /** Price in the app right now at the selected fridge. */
  appPriceCents: number;
  promo: { kind: PromoKind; label: string } | null;
  nutrition: Nutrition & { weightG: number; source: "label" | "estimate" };
  art: { layers: string[]; accent: string };
  isNewArrival: boolean;
  stock: StockAtMachine | null;
};

export type MachineStatus = "online" | "offline" | "maintenance";

export type MachineDTO = {
  id: string;
  name: string;
  venue: string;
  area: string;
  address: string;
  lat: number;
  lng: number;
  kind: "campus" | "office" | "beach";
  hours: string;
  isSeasonal: boolean;
  status: MachineStatus;
  salesLocked: boolean;
  temperatureC: number;
  notice: string | null;
  lastSeenAt: string | null;
  /** Online, not too warm, not closed for the season. */
  isSelling: boolean;
  distanceKm: number | null;
  /** Total units available to buy right now. */
  units: number;
};

export type ProductAvailability = {
  machine: MachineDTO;
  available: number;
  nearestExpiry: string | null;
};

export type OrderStatus =
  | "reserved"
  | "completed"
  | "expired"
  | "cancelled"
  | "failed"
  | "placed"
  | "assigned"
  | "picked_up"
  | "on_the_way"
  | "delivered";

export type PaymentMethod = "wallet" | "card" | "pay_at_fridge" | "cash" | "machine_card" | "machine_cash";

export type OrderItemDTO = {
  sku: string;
  name: string;
  category: Category;
  qty: number;
  unitPriceCents: number;
  listPriceCents: number;
  discountLabel: string | null;
  nutrition: Nutrition;
};

export type OrderDTO = {
  id: string;
  number: string;
  status: OrderStatus;
  fulfillment: "pickup" | "delivery" | "walk_up";
  machine: { id: string; name: string; area: string; lat: number; lng: number };
  payment: { method: PaymentMethod; status: "unpaid" | "paid" | "refunded" };
  items: OrderItemDTO[];
  totals: { subtotalCents: number; discountCents: number; deliveryFeeCents: number; totalCents: number };
  promos: string[];
  pointsEarned: number;
  pickupCode: string | null;
  holdExpiresAt: string | null;
  delivery: {
    address: string;
    lat: number;
    lng: number;
    km: number;
    etaAt: string | null;
    driver: { name: string; vehicle: string } | null;
    courierCode: string | null;
  } | null;
  timeline: Partial<Record<"reservedAt" | "placedAt" | "assignedAt" | "pickedUpAt" | "onTheWayAt" | "deliveredAt" | "completedAt" | "cancelledAt" | "expiredAt", string>>;
  customer: { name: string; phone: string } | null;
  createdAt: string;
  failureReason: string | null;
  canCancel: boolean;
  canReportIssue: boolean;
};

export type StreakDay = { day: string; label: string; status: "done" | "rest" | "missed" | "today" | "upcoming" };

export type LoyaltyDTO = {
  points: number;
  lifetimePoints: number;
  tier: { id: string; name: string; multiplier: number };
  nextTier: { name: string; minPoints: number } | null;
  tierProgress: number;
  pointsToNext: number;
  streak: { count: number; best: number; alive: boolean; week: StreakDay[] };
  stamps: { count: number; size: number };
};

export type TargetsDTO = Nutrition & { basis: "profile" | "default" | "custom" };

export type AddressDTO = { id: string; label: string; line1: string; lat: number; lng: number };

export type MeDTO = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  role: "customer" | "admin";
  referralCode: string;
  walletCents: number;
  favoriteMachineId: string | null;
  profile: {
    sex: "female" | "male" | null;
    birthYear: number | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: "sedentary" | "light" | "moderate" | "active" | "athlete";
    goal: "lose" | "maintain" | "gain";
    dietPrefs: string[];
    allergens: string[];
  };
  targets: TargetsDTO;
  student: { email: string | null; verified: boolean };
  addresses: AddressDTO[];
  loyalty: LoyaltyDTO;
};

export type DiaryEntryDTO = Nutrition & {
  id: string;
  name: string;
  qty: number;
  source: "order" | "manual";
  eatenAt: string;
};

export type TodayDTO = { day: string; consumed: Nutrition; targets: TargetsDTO; entries: DiaryEntryDTO[] };

export type WeekDayDTO = Nutrition & { day: string; label: string };

export type NotificationDTO = {
  id: string;
  kind: "order" | "loyalty" | "stock" | "system";
  title: string;
  body: string;
  href: string | null;
  createdAt: string;
  readAt: string | null;
};

export type WalletTxnDTO = {
  id: string;
  type: "topup" | "payment" | "refund" | "reward" | "adjustment";
  amountCents: number;
  balanceAfterCents: number;
  description: string;
  createdAt: string;
};

export type RewardDTO = {
  id: string;
  slug: string;
  name: string;
  description: string;
  costPoints: number;
  kind: "wallet_credit" | "merch";
  valueCents: number;
};

export type Celebration = {
  points: number;
  bonus: number;
  streak: number;
  milestone: number | null;
  freeMealCents: number;
};

export type FeedItem = {
  id: string;
  at: string;
  kind: "order" | "machine" | "stock" | "payment" | "issue";
  text: string;
};

export type RealtimeEvent =
  | { type: "stock"; machineId: string; items: { sku: string; available: number; onHand: number; held: number }[] }
  | { type: "machine"; machine: MachineDTO }
  | { type: "order"; order: OrderDTO; celebrate?: Celebration }
  | { type: "notification"; notification: NotificationDTO }
  | { type: "me" }
  | { type: "feed"; item: FeedItem };

export type AssistantSuggestion = {
  product: ProductDTO;
  reason: string;
  /** Best fridge to get it from, when not the selected one. */
  alternative: { machineId: string; machineName: string; available: number; distanceKm: number | null } | null;
};

export type AssistantReply = {
  reply: string;
  suggestions: AssistantSuggestion[];
  engine: "openai" | "claude" | "rules";
};
