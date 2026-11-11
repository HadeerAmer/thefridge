import { AskSchema, ask } from "@/server/assistant";
import { getSession } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";

export const runtime = "nodejs";

/** "Ask The Fridge" — natural-language picks from the live menu. */
export const POST = route(async (req) => {
  const session = await getSession();
  return ask(session?.userId ?? null, await parseJson(req, AskSchema));
});
