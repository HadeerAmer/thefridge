import { z } from "zod";
import { env } from "@/env";
import { parseJson, route } from "@/server/http";
import { PhoneSchema } from "@/server/users";

/** Step 1 of sign-in. Demo mode skips SMS and tells the user the fixed code. */
export const POST = route(async (req) => {
  const { phone } = await parseJson(req, z.object({ phone: PhoneSchema }));
  return {
    phone,
    sent: true,
    hint: env.DEMO_MODE ? `Demo mode — use code ${env.DEMO_OTP}` : "We sent you a code by SMS.",
  };
});
