"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LatLng } from "@/lib/geo";
import { safeStorage } from "./cart";

type LocationState = {
  /** The fridge the menu is shown for. */
  machineId: string | null;
  /** Where the user is (browser geolocation), if they shared it. */
  coords: LatLng | null;
  status: "idle" | "locating" | "granted" | "denied";
  setMachine: (id: string) => void;
  locate: () => void;
};

export const useLocationStore = create<LocationState>()(
  persist(
    (set, get) => ({
      machineId: null,
      coords: null,
      status: "idle",
      setMachine: (machineId) => set({ machineId }),
      locate: () => {
        if (typeof navigator === "undefined" || !navigator.geolocation || get().status === "locating") return;
        set({ status: "locating" });
        navigator.geolocation.getCurrentPosition(
          (pos) => set({ coords: { lat: pos.coords.latitude, lng: pos.coords.longitude }, status: "granted" }),
          () => set({ status: "denied" }),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60_000 },
        );
      },
    }),
    {
      name: "tf-location",
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ machineId: s.machineId, coords: s.coords }),
    },
  ),
);
