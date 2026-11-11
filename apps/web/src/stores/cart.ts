"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/** The cart works for guests too — it's only sent to the server at checkout. */
export type CartLine = { sku: string; qty: number };

type CartState = {
  lines: CartLine[];
  add: (sku: string, qty?: number) => void;
  setQty: (sku: string, qty: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
};

const MAX_PER_ITEM = 5;

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (sku, qty = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.sku === sku);
          if (existing) {
            return { lines: s.lines.map((l) => (l.sku === sku ? { ...l, qty: Math.min(MAX_PER_ITEM, l.qty + qty) } : l)) };
          }
          return { lines: [...s.lines, { sku, qty: Math.min(MAX_PER_ITEM, qty) }] };
        }),
      setQty: (sku, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.sku !== sku) : s.lines.map((l) => (l.sku === sku ? { ...l, qty: Math.min(MAX_PER_ITEM, qty) } : l)),
        })),
      remove: (sku) => set((s) => ({ lines: s.lines.filter((l) => l.sku !== sku) })),
      clear: () => set({ lines: [] }),
    }),
    { name: "tf-cart", storage: createJSONStorage(() => safeStorage()) },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((n, l) => n + l.qty, 0);

/** localStorage can throw (private mode, blocked storage) — fall back to memory. */
export function safeStorage(): Storage {
  try {
    const probe = "__tf_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (k) => memory.get(k) ?? null,
      setItem: (k, v) => void memory.set(k, v),
      removeItem: (k) => void memory.delete(k),
      clear: () => memory.clear(),
      key: (i) => [...memory.keys()][i] ?? null,
      get length() {
        return memory.size;
      },
    };
  }
}
