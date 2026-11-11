import type { HoldItem, HoldPurpose, MachineStatus } from "@thefridge/shared/contracts";

export type SlotState = {
  code: string;
  sku: string | null;
  name: string | null;
  priceCents: number | null;
  qty: number;
  capacity: number;
  expiresAt: string | null;
};

export type HoldState = {
  id: string;
  ref: string;
  items: HoldItem[];
  purpose: HoldPurpose;
  status: "active" | "released" | "consumed" | "expired";
  createdAt: string;
  expiresAt: string;
};

export type VendRecord = {
  vendId: string;
  machineId: string;
  holdId: string | null;
  ref: string | null;
  channel: "app" | "walk_up" | "courier";
  items: { sku: string; qty: number; slot: string; unitPriceCents: number }[];
  payment: { method: "card" | "cash"; amountCents: number; reference: string } | null;
  completedAt: string;
};

export type MachineState = {
  id: string;
  name: string;
  status: MachineStatus;
  temperatureC: number;
  /** Temperature the cooling unit is aiming for; drift happens around it. */
  targetTemperatureC: number;
  salesLocked: boolean;
  notice: string | null;
  lastSeenAt: string;
  slots: SlotState[];
  holds: HoldState[];
};

export type FleetState = {
  version: 1;
  machines: MachineState[];
  vends: VendRecord[];
};

/** Above this the machine locks sales to protect food safety. */
export const SAFE_MAX_TEMPERATURE_C = 8;
