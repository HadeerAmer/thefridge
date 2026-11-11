import { z } from "zod";
import { HoldPurposeSchema, SkuSchema } from "./machine";
import { MachinePaymentMethodSchema } from "./events";

/**
 * Calls a machine makes to the cloud when its scanner reads a QR / pickup code.
 *   POST /api/machine/v1/redeem             → what to dispense and how much is still due
 *   POST /api/machine/v1/orders/:id/payment → customer paid on the machine's card reader
 */

export const RedeemRequestSchema = z.object({
  code: z.string().trim().min(4).max(40),
});
export type RedeemRequest = z.infer<typeof RedeemRequestSchema>;

export const RedeemResponseSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  holdId: z.string(),
  purpose: HoldPurposeSchema,
  customerName: z.string().nullable(),
  items: z.array(
    z.object({
      sku: SkuSchema,
      name: z.string(),
      qty: z.number().int().positive(),
      unitPriceCents: z.number().int().nonnegative(),
    }),
  ),
  amountDueCents: z.number().int().nonnegative(),
});
export type RedeemResponse = z.infer<typeof RedeemResponseSchema>;

export const MachinePaymentRequestSchema = z.object({
  amountCents: z.number().int().positive(),
  method: MachinePaymentMethodSchema,
  reference: z.string().min(4).max(64),
});
export type MachinePaymentRequest = z.infer<typeof MachinePaymentRequestSchema>;
