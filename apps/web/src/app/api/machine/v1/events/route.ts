import { route } from "@/server/http";
import { ingestMachineEvent, verifyMachineRequest } from "@/server/machines/webhooks";

export const runtime = "nodejs";

/** Signed webhooks from the machines (stock, holds, vends, status). */
export const POST = route(async (req) => {
  const { machineId, body } = await verifyMachineRequest(req);
  return ingestMachineEvent(machineId, body);
});
