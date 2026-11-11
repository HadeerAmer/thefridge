"use client";

import { create } from "zustand";

/**
 * Live stock pushed over SSE, keyed "machineId:sku" → units available.
 * Components fall back to the value they rendered with until an update arrives.
 */
type LiveState = {
  available: Record<string, number>;
  /** Last time each key changed — drives the little "just updated" pulse. */
  changedAt: Record<string, number>;
  apply: (machineId: string, items: { sku: string; available: number }[]) => void;
};

export const useLiveStock = create<LiveState>()((set) => ({
  available: {},
  changedAt: {},
  apply: (machineId, items) =>
    set((s) => {
      const available = { ...s.available };
      const changedAt = { ...s.changedAt };
      const now = Date.now();
      for (const item of items) {
        const key = `${machineId}:${item.sku}`;
        if (available[key] !== item.available) changedAt[key] = now;
        available[key] = item.available;
      }
      return { available, changedAt };
    }),
}));

export function useAvailable(machineId: string | null | undefined, sku: string, fallback: number | null | undefined) {
  return useLiveStock((s) => (machineId ? (s.available[`${machineId}:${sku}`] ?? fallback ?? null) : (fallback ?? null)));
}
