import "server-only";
import type { z } from "zod";
import {
  ApiErrorSchema,
  HoldSchema,
  InventorySchema,
  MachineSummarySchema,
  VendResultSchema,
  type CreateHoldRequest,
  type Hold,
  type Inventory,
  type MachineSummary,
  type VendResult,
} from "@thefridge/shared/contracts";
import { API_KEY_HEADER } from "@thefridge/shared/signing";
import { env } from "@/env";
import { AppError } from "../errors";

const TIMEOUT_MS = 4000;

/**
 * Typed client for the machine API (the fridge simulator in this demo).
 * Machine errors become user-facing AppErrors with sensible statuses.
 */
class MachineGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
  ) {}

  listMachines(): Promise<MachineSummary[]> {
    return this.request("GET", "/api/v1/machines", undefined, MachineSummarySchema.array());
  }

  inventory(machineId: string): Promise<Inventory> {
    return this.request("GET", `/api/v1/machines/${enc(machineId)}/inventory`, undefined, InventorySchema);
  }

  createHold(machineId: string, body: CreateHoldRequest): Promise<Hold> {
    return this.request("POST", `/api/v1/machines/${enc(machineId)}/holds`, body, HoldSchema);
  }

  releaseHold(machineId: string, holdId: string): Promise<Hold> {
    return this.request("DELETE", `/api/v1/machines/${enc(machineId)}/holds/${enc(holdId)}`, undefined, HoldSchema);
  }

  /** Remote vend of a held order — the courier collecting a delivery. */
  vend(machineId: string, holdId: string): Promise<VendResult> {
    return this.request("POST", `/api/v1/machines/${enc(machineId)}/vend`, { holdId }, VendResultSchema);
  }

  setNotice(machineId: string, message: string | null): Promise<MachineSummary> {
    return this.request("PUT", `/api/v1/machines/${enc(machineId)}/notice`, { message }, MachineSummarySchema);
  }

  private async request<T>(method: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { [API_KEY_HEADER]: this.apiKey, ...(body ? { "content-type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AppError("machine_unreachable", "We can't reach this fridge right now. Please try again in a moment.", 503);
    }

    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ApiErrorSchema.safeParse(json);
      const code = parsed.success ? parsed.data.error.code : "machine_error";
      const message = parsed.success ? parsed.data.error.message : `Fridge error (${res.status})`;
      if (code === "insufficient_stock") throw new AppError("sold_out", humanizeStock(message), 409);
      if (code === "machine_unavailable") throw new AppError("machine_unavailable", message, 423);
      if (code === "hold_not_active") throw new AppError("hold_not_active", message, 409);
      throw new AppError(code, message, res.status >= 500 ? 502 : res.status);
    }
    return schema.parse(json);
  }
}

function enc(value: string) {
  return encodeURIComponent(value);
}

/** "SAL-CAESAR is sold out here" → "That item is sold out here" (the UI names the product). */
function humanizeStock(message: string) {
  return message.replace(/\b[A-Z]{3}-[A-Z0-9-]+\b/g, "that item");
}

export const machineGateway = new MachineGateway(env.FRIDGE_API_URL, env.FRIDGE_API_KEY);
