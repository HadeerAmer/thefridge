"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type PublicConfig = {
  holdMinutes: number;
  delivery: { enabled: boolean; maxKm: number; freeOverCents: number };
  pricing: {
    appDiscountPercent: number;
    happyHour: { enabled: boolean; startHour: number; endHour: number; percent: number; activeNow: boolean };
    comboDrinkDiscountCents: number;
    studentPercent: number;
  };
  loyalty: { stampCardSize: number; pointsPerEgp: number };
  demo: { otp: string; testCards: { approved: string; declined: string; insufficientFunds: string } } | null;
};

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: () => api<PublicConfig>("/api/config"), staleTime: 60_000 });
}
