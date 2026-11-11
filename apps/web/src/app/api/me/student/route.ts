import { z } from "zod";
import { requireUser } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { verifyStudent } from "@/server/users";

export const POST = route(async (req) => {
  const session = await requireUser();
  const { email } = await parseJson(req, z.object({ email: z.email() }));
  return { me: await verifyStudent(session.userId, email) };
});
