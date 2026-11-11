import { z } from "zod";
import {
  IsoDateSchema,
  MachineStatusSchema,
  SkuSchema,
  StockLevelSchema,
} from "./machine";

/**
 * Webhook events a machine pushes to the cloud (POST /api/machine/v1/events).
 * Every event has a unique id so the cloud can process it exactly once.
 */

const base = {
  id: z.string().min(8),
  machineId: z.string(),
  occurredAt: IsoDateSchema,
};

export const StockChangeReasonSchema = z.enum([
  "hold",
  "release",
  "expire",
  "vend",
  "restock",
  "adjust",
]);

export const VendChannelSchema = z.enum(["app", "walk_up", "courier"]);
export type VendChannel = z.infer<typeof VendChannelSchema>;

export const MachinePaymentMethodSchema = z.enum(["card", "cash"]);

export const InventorySnapshotEventSchema = z.object({
  ...base,
  type: z.literal("inventory.snapshot"),
  data: z.object({
    items: z.array(
      StockLevelSchema.extend({
        slots: z.array(z.string()),
        nearestExpiry: IsoDateSchema.nullable(),
      }),
    ),
  }),
});

export const StockChangedEventSchema = z.object({
  ...base,
  type: z.literal("stock.changed"),
  data: z.object({
    reason: StockChangeReasonSchema,
    items: z.array(StockLevelSchema),
  }),
});

export const HoldExpiredEventSchema = z.object({
  ...base,
  type: z.literal("hold.expired"),
  data: z.object({ holdId: z.string(), ref: z.string() }),
});

export const VendCompletedEventSchema = z.object({
  ...base,
  type: z.literal("vend.completed"),
  data: z.object({
    vendId: z.string(),
    holdId: z.string().nullable(),
    ref: z.string().nullable(),
    channel: VendChannelSchema,
    items: z.array(
      z.object({
        sku: SkuSchema,
        qty: z.number().int().positive(),
        unitPriceCents: z.number().int().nonnegative(),
      }),
    ),
    /** Present when the customer paid on the machine itself. */
    payment: z
      .object({
        method: MachinePaymentMethodSchema,
        amountCents: z.number().int().nonnegative(),
        reference: z.string(),
      })
      .nullable(),
  }),
});

export const MachineStatusEventSchema = z.object({
  ...base,
  type: z.literal("machine.status"),
  data: z.object({
    status: MachineStatusSchema,
    temperatureC: z.number(),
    salesLocked: z.boolean(),
    notice: z.string().nullable(),
  }),
});

export const MachineEventSchema = z.discriminatedUnion("type", [
  InventorySnapshotEventSchema,
  StockChangedEventSchema,
  HoldExpiredEventSchema,
  VendCompletedEventSchema,
  MachineStatusEventSchema,
]);
export type MachineEvent = z.infer<typeof MachineEventSchema>;
export type MachineEventType = MachineEvent["type"];
export type MachineEventOf<T extends MachineEventType> = Extract<MachineEvent, { type: T }>;
