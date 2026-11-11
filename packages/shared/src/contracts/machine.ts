import { z } from "zod";

/**
 * Machine API contract — what a The Fridge vending machine exposes to the cloud.
 * The simulator implements it; the cloud's machine gateway consumes it.
 */

export const SkuSchema = z.string().regex(/^[A-Z0-9-]{3,32}$/, "Invalid SKU");
export const IsoDateSchema = z.iso.datetime({ offset: true });

export const MachineStatusSchema = z.enum(["online", "offline", "maintenance"]);
export type MachineStatus = z.infer<typeof MachineStatusSchema>;

export const SlotSchema = z.object({
  code: z.string().regex(/^[A-F][1-9]$/),
  sku: SkuSchema.nullable(),
  name: z.string().nullable(),
  priceCents: z.number().int().nonnegative().nullable(),
  qty: z.number().int().nonnegative(),
  capacity: z.number().int().positive(),
  expiresAt: IsoDateSchema.nullable(),
});
export type Slot = z.infer<typeof SlotSchema>;

export const StockLevelSchema = z.object({
  sku: SkuSchema,
  onHand: z.number().int().nonnegative(),
  held: z.number().int().nonnegative(),
});
export type StockLevel = z.infer<typeof StockLevelSchema>;

export const InventoryItemSchema = StockLevelSchema.extend({
  available: z.number().int().nonnegative(),
  slots: z.array(z.string()),
  nearestExpiry: IsoDateSchema.nullable(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

export const InventorySchema = z.object({
  machineId: z.string(),
  items: z.array(InventoryItemSchema),
  updatedAt: IsoDateSchema,
});
export type Inventory = z.infer<typeof InventorySchema>;

export const MachineSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: MachineStatusSchema,
  temperatureC: z.number(),
  salesLocked: z.boolean(),
  notice: z.string().nullable(),
  lastSeenAt: IsoDateSchema,
});
export type MachineSummary = z.infer<typeof MachineSummarySchema>;

export const HoldItemSchema = z.object({
  sku: SkuSchema,
  qty: z.number().int().min(1).max(10),
});
export type HoldItem = z.infer<typeof HoldItemSchema>;

export const HoldPurposeSchema = z.enum(["customer", "courier"]);
export type HoldPurpose = z.infer<typeof HoldPurposeSchema>;

export const HoldStatusSchema = z.enum(["active", "released", "consumed", "expired"]);

export const CreateHoldRequestSchema = z.object({
  /** Cloud reference, usually the order id. */
  ref: z.string().min(1).max(64),
  items: z.array(HoldItemSchema).min(1).max(20),
  ttlSeconds: z.number().int().min(30).max(4 * 60 * 60),
  purpose: HoldPurposeSchema.default("customer"),
});
export type CreateHoldRequest = z.input<typeof CreateHoldRequestSchema>;

export const HoldSchema = z.object({
  id: z.string(),
  machineId: z.string(),
  ref: z.string(),
  items: z.array(HoldItemSchema),
  purpose: HoldPurposeSchema,
  status: HoldStatusSchema,
  createdAt: IsoDateSchema,
  expiresAt: IsoDateSchema,
});
export type Hold = z.infer<typeof HoldSchema>;

export const VendRequestSchema = z.object({
  holdId: z.string().min(1),
});
export type VendRequest = z.infer<typeof VendRequestSchema>;

export const VendedItemSchema = z.object({
  sku: SkuSchema,
  qty: z.number().int().positive(),
  slot: z.string(),
  unitPriceCents: z.number().int().nonnegative(),
});

export const VendResultSchema = z.object({
  vendId: z.string(),
  machineId: z.string(),
  holdId: z.string().nullable(),
  ref: z.string().nullable(),
  items: z.array(VendedItemSchema),
  completedAt: IsoDateSchema,
});
export type VendResult = z.infer<typeof VendResultSchema>;

export const NoticeRequestSchema = z.object({
  message: z.string().trim().max(280).nullable(),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

/** Error codes the machine API can return. */
export const MachineErrorCode = {
  NotFound: "not_found",
  InsufficientStock: "insufficient_stock",
  MachineUnavailable: "machine_unavailable",
  HoldNotActive: "hold_not_active",
  Unauthorized: "unauthorized",
  Invalid: "invalid_request",
} as const;
