import { RedeemRequestSchema } from "@thefridge/shared/contracts";
import { route } from "@/server/http";
import { verifyMachineRequest } from "@/server/machines/webhooks";
import { redeemCode } from "@/server/orders/service";

export const runtime = "nodejs";

/** The machine's scanner read a pickup / courier code. */
export const POST = route(async (req) => {
  const { machineId, body } = await verifyMachineRequest(req);
  const { code } = RedeemRequestSchema.parse(body);
  return redeemCode(machineId, code);
});
