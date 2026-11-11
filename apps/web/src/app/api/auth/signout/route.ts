import { endSession } from "@/server/auth/session";
import { route } from "@/server/http";

export const POST = route(async () => {
  await endSession();
  return { ok: true };
});
