import "server-only";
import { MachineEventSchema, type MachineEvent } from "@thefridge/shared/contracts";
import { MACHINE_ID_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from "@thefridge/shared/signing";
import { env } from "@/env";
import { MachineEventInbox } from "../db/models";
import { AppError } from "../errors";
import { applyMachineStatus, applySnapshot, applyStockLevels, scheduleResync } from "../inventory";
import { expireOrder, handleVend } from "../orders/service";
import { getMachine } from "./service";

/**
 * Authenticates a machine → cloud request: HMAC signature over the raw body,
 * timestamp within 5 minutes, and a known machine id. Returns the parsed JSON body.
 */
export async function verifyMachineRequest(req: Request): Promise<{ machineId: string; body: unknown }> {
  const raw = await req.text();
  const machineId = req.headers.get(MACHINE_ID_HEADER);
  const result = verifySignature({
    secret: env.MACHINE_WEBHOOK_SECRET,
    body: raw,
    timestamp: req.headers.get(TIMESTAMP_HEADER),
    signature: req.headers.get(SIGNATURE_HEADER),
  });
  if (!result.ok || !machineId) throw new AppError("bad_signature", `Request signature ${result.ok ? "ok" : result.reason}`, 401);
  if (!(await getMachine(machineId))) throw new AppError("unknown_machine", `Unknown machine ${machineId}`, 403);
  try {
    return { machineId, body: JSON.parse(raw) };
  } catch {
    throw new AppError("invalid_request", "Body must be JSON", 400);
  }
}

/**
 * Applies one machine event exactly once. The inbox insert claims the event id; if handling
 * fails the claim is removed so the machine's retry is processed again.
 */
export async function ingestMachineEvent(machineId: string, body: unknown): Promise<{ duplicate: boolean }> {
  const event = MachineEventSchema.parse(body);
  if (event.machineId !== machineId) throw new AppError("machine_mismatch", "Event machine doesn't match the signer", 403);

  try {
    await MachineEventInbox.create({ _id: event.id, machineId, type: event.type });
  } catch (error) {
    if ((error as { code?: number }).code === 11000) return { duplicate: true };
    throw error;
  }

  try {
    await apply(event);
    return { duplicate: false };
  } catch (error) {
    await MachineEventInbox.deleteOne({ _id: event.id });
    throw error;
  }
}

async function apply(event: MachineEvent): Promise<void> {
  switch (event.type) {
    case "inventory.snapshot":
      return applySnapshot(event.machineId, event.data.items);
    case "stock.changed":
      await applyStockLevels(event.machineId, event.data.items);
      if (event.data.reason === "vend" || event.data.reason === "restock") scheduleResync(event.machineId);
      return;
    case "hold.expired":
      return expireOrder(event.data.ref);
    case "vend.completed":
      return handleVend(event.machineId, event.data);
    case "machine.status":
      return applyMachineStatus(event.machineId, event.data);
  }
}
