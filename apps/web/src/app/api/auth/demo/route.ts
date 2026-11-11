import { z } from "zod";
import { env } from "@/env";
import { startSession } from "@/server/auth/session";
import { User, type UserDoc } from "@/server/db/models";
import { AppError } from "@/server/errors";
import { parseJson, route } from "@/server/http";
import { DEMO_ACCOUNTS } from "@/server/demo-accounts";

/** One-tap sign-in as a seeded demo account (demo mode only). */
export const POST = route(async (req) => {
  if (!env.DEMO_MODE) throw new AppError("not_found", "Not found", 404);
  const { as } = await parseJson(req, z.object({ as: z.enum(["customer", "admin"]) }));
  const user = await User.findOne({ phone: DEMO_ACCOUNTS[as].phone }).lean<UserDoc>();
  if (!user) throw new AppError("not_seeded", "Demo accounts are missing — run `npm run setup` first.", 409);
  await startSession({ userId: String(user._id), role: user.role === "admin" ? "admin" : "customer", name: user.name });
  return { ok: true, role: user.role };
});
