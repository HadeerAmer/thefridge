"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { newIdempotencyKey, useCreateOrder, useMe } from "@/lib/queries";
import type { ProductDTO } from "@/lib/types";

/**
 * One tap → reserved. Pays from the wallet when it covers the price, otherwise
 * reserves with "pay at the fridge" — no checkout screen needed for a single item.
 */
export function useQuickReserve() {
  const router = useRouter();
  const { data: me } = useMe();
  const createOrder = useCreateOrder();

  async function reserve(product: ProductDTO, qty = 1) {
    if (!me) {
      router.push(`/signin?next=${encodeURIComponent(`/p/${product.slug}?reserve=1`)}`);
      return;
    }
    const machineId = product.stock?.machineId;
    if (!machineId) {
      toast.error("Pick a fridge first");
      return;
    }
    const total = product.appPriceCents * qty;
    const paymentMethod = me.walletCents >= total ? "wallet" : "pay_at_fridge";
    try {
      const order = await createOrder.mutateAsync({
        machineId,
        items: [{ sku: product.sku, qty }],
        fulfillment: "pickup",
        paymentMethod,
        idempotencyKey: newIdempotencyKey(),
      });
      const minutes = order.holdExpiresAt ? Math.round((Date.parse(order.holdExpiresAt) - Date.now()) / 60_000) : 15;
      toast.success(`Reserved — it's yours for ${minutes} min`, {
        description: paymentMethod === "wallet" ? "Paid from your wallet. Scan the QR at the fridge." : "Pay at the fridge when you scan.",
      });
      router.push(`/orders/${order.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't reserve — try again.");
    }
  }

  return { reserve, pending: createOrder.isPending };
}
