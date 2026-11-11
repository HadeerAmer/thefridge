import type { OrderDTO, OrderStatus } from "@/lib/types";

export const STATUS_LABEL: Record<OrderStatus, string> = {
  reserved: "Ready to collect",
  completed: "Collected",
  expired: "Expired",
  cancelled: "Cancelled",
  failed: "Failed",
  placed: "Order placed",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
};

export function statusTone(status: OrderStatus): "green" | "sun" | "tomato" | "neutral" | "sky" {
  if (status === "reserved" || status === "placed" || status === "assigned") return "sun";
  if (status === "picked_up" || status === "on_the_way") return "sky";
  if (status === "completed" || status === "delivered") return "green";
  if (status === "failed") return "tomato";
  return "neutral";
}

export const isActiveOrder = (o: OrderDTO) => ["reserved", "placed", "assigned", "picked_up", "on_the_way"].includes(o.status);

export const PAYMENT_LABEL: Record<OrderDTO["payment"]["method"], string> = {
  wallet: "Wallet",
  card: "Card",
  pay_at_fridge: "Pay at the fridge",
  cash: "Cash on delivery",
  machine_card: "Card at the fridge",
  machine_cash: "Cash at the fridge",
};
