import { requireUser } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { addAddress, AddressInputSchema } from "@/server/users";

export const POST = route(async (req) => {
  const session = await requireUser();
  return { me: await addAddress(session.userId, await parseJson(req, AddressInputSchema)) };
});
