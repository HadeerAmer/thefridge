import { getSession, requireUser } from "@/server/auth/session";
import { createProductRequest, listProductRequests, ProductRequestSchema } from "@/server/feedback";
import { parseJson, route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route(async () => {
  const session = await getSession();
  return { requests: await listProductRequests(session?.userId ?? null) };
});

export const POST = route(async (req) => {
  const session = await requireUser();
  await createProductRequest(session.userId, await parseJson(req, ProductRequestSchema));
  return { requests: await listProductRequests(session.userId) };
});
