"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  MachineDTO,
  MeDTO,
  NotificationDTO,
  OrderDTO,
  ProductAvailability,
  ProductDTO,
  RewardDTO,
  TodayDTO,
  WalletTxnDTO,
  WeekDayDTO,
} from "./types";
import type { LatLng } from "./geo";

/** Query keys in one place so invalidation stays consistent. */
export const keys = {
  me: ["me"] as const,
  today: ["today"] as const,
  menu: (machineId: string | null) => ["menu", machineId] as const,
  machines: (near: LatLng | null) => ["machines", near ? `${near.lat.toFixed(3)},${near.lng.toFixed(3)}` : "all"] as const,
  product: (slug: string, machineId: string | null) => ["product", slug, machineId] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["order", id] as const,
  wallet: ["wallet"] as const,
  rewards: ["rewards"] as const,
  notifications: ["notifications"] as const,
  requests: ["requests"] as const,
};

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<{ me: MeDTO | null }>("/api/me").then((r) => r.me),
    staleTime: 30_000,
  });
}

export function useToday(enabled: boolean) {
  return useQuery({
    queryKey: keys.today,
    queryFn: () =>
      api<{ today: TodayDTO; week: WeekDayDTO[]; usual: { sku: string; machineId: string; count: number } | null }>("/api/me/today"),
    enabled,
    staleTime: 30_000,
  });
}

export function useMenu(machineId: string | null, initial?: { products: ProductDTO[]; machine: MachineDTO | null }) {
  return useQuery({
    queryKey: keys.menu(machineId),
    queryFn: () =>
      api<{ products: ProductDTO[]; machine: MachineDTO | null }>(`/api/catalog${machineId ? `?fridge=${encodeURIComponent(machineId)}` : ""}`),
    initialData: initial,
    staleTime: 20_000,
  });
}

export function useMachines(near: LatLng | null, initial?: MachineDTO[]) {
  return useQuery({
    queryKey: keys.machines(near),
    queryFn: () =>
      api<{ machines: MachineDTO[] }>(`/api/machines${near ? `?lat=${near.lat}&lng=${near.lng}` : ""}`).then((r) => r.machines),
    initialData: initial,
    staleTime: 20_000,
  });
}

export function useProduct(slug: string, machineId: string | null, near: LatLng | null) {
  const params = new URLSearchParams();
  if (machineId) params.set("fridge", machineId);
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lng", String(near.lng));
  }
  return useQuery({
    queryKey: [...keys.product(slug, machineId), near?.lat ?? null],
    queryFn: () => api<{ product: ProductDTO; availability: ProductAvailability[] }>(`/api/products/${slug}?${params}`),
  });
}

export function useOrders(enabled = true) {
  return useQuery({
    queryKey: keys.orders,
    queryFn: () => api<{ orders: OrderDTO[] }>("/api/orders").then((r) => r.orders),
    enabled,
  });
}

export function useOrder(id: string) {
  return useQuery({
    queryKey: keys.order(id),
    queryFn: () => api<{ order: OrderDTO }>(`/api/orders/${id}`).then((r) => r.order),
  });
}

export function useWallet(enabled = true) {
  return useQuery({
    queryKey: keys.wallet,
    queryFn: () => api<{ walletCents: number; transactions: WalletTxnDTO[] }>("/api/wallet"),
    enabled,
  });
}

export function useRewards() {
  return useQuery({ queryKey: keys.rewards, queryFn: () => api<{ rewards: RewardDTO[] }>("/api/rewards").then((r) => r.rewards) });
}

export function useNotifications(enabled: boolean) {
  return useQuery({
    queryKey: keys.notifications,
    queryFn: () => api<{ notifications: NotificationDTO[] }>("/api/notifications").then((r) => r.notifications),
    enabled,
  });
}

export function useRequests() {
  return useQuery({
    queryKey: keys.requests,
    queryFn: () => api<{ requests: { id: string; name: string; note: string | null; votes: number; voted: boolean }[] }>("/api/requests").then((r) => r.requests),
  });
}

export type CreateOrderBody = {
  machineId: string;
  items: { sku: string; qty: number }[];
  fulfillment: "pickup" | "delivery";
  paymentMethod: "wallet" | "card" | "pay_at_fridge" | "cash";
  card?: { number: string; expiry: string; cvc: string };
  delivery?: { address: string; lat: number; lng: number };
  idempotencyKey: string;
};

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateOrderBody) => api<{ order: OrderDTO }>("/api/orders", { method: "POST", json: body }).then((r) => r.order),
    onSuccess: (order) => {
      qc.setQueryData(keys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: keys.orders });
      void qc.invalidateQueries({ queryKey: keys.me });
      void qc.invalidateQueries({ queryKey: ["menu"] });
    },
  });
}

export function newIdempotencyKey() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
