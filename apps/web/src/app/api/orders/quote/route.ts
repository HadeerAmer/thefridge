import { getSession } from "@/server/auth/session";
import { parseJson, route } from "@/server/http";
import { quoteOrder, QuoteRequestSchema } from "@/server/orders/service";

/** Live price for the checkout screen (works for guests too). */
export const POST = route(async (req) => {
  const session = await getSession();
  return { quote: await quoteOrder(session?.userId ?? null, await parseJson(req, QuoteRequestSchema)) };
});
