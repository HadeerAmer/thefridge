import { z } from "zod";
import { env } from "@/env";
import { startSession } from "@/server/auth/session";
import { AppError } from "@/server/errors";
import { parseJson, route } from "@/server/http";
import { findOrCreateUser, PhoneSchema, toMeDTO } from "@/server/users";

const Body = z.object({
  phone: PhoneSchema,
  code: z.string().trim().regex(/^\d{4,6}$/, "Enter the code you received"),
  name: z.string().trim().max(60).optional(),
  referralCode: z.string().trim().max(20).optional(),
});

/** Step 2 of sign-in: check the code, create the account on first sign-in, start a session. */
export const POST = route(async (req) => {
  const { phone, code, name, referralCode } = await parseJson(req, Body);
  if (code !== env.DEMO_OTP) throw new AppError("wrong_code", "That code isn't right. Try again.", 400);
  const { user, created } = await findOrCreateUser(phone, name, referralCode || undefined);
  await startSession({ userId: String(user._id), role: user.role === "admin" ? "admin" : "customer", name: user.name });
  return { me: await toMeDTO(user), created };
});
