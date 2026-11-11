import { MachinePaymentRequestSchema } from "@thefridge/shared/contracts";
import { route } from "@/server/http";
import { verifyMachineRequest } from "@/server/machines/webhooks";
import { recordMachinePayment } from "@/server/orders/service";

export const runtime = "nodejs";

/** The customer paid on the machine's card reader / cash slot. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, { params }) => {
  const { machineId, body } = await verifyMachineRequest(req);
  await recordMachinePayment(machineId, (await params).id, MachinePaymentRequestSchema.parse(body));
  return { ok: true };
});
