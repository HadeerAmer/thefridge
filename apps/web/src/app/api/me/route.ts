import { getSession, requireUser } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { getMe, ProfilePatchSchema, updateProfile } from "@/server/users";

export const dynamic = "force-dynamic";

/** Guests get `{ me: null }` — browsing never requires an account. */
export const GET = route(async () => {
  const session = await getSession();
  return { me: session ? await getMe(session.userId) : null };
});

export const PATCH = route(async (req) => {
  const session = await requireUser();
  const patch = await parseJson(req, ProfilePatchSchema);
  return { me: await updateProfile(session.userId, patch) };
});
