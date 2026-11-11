import { z } from "zod";
import { quoteDelivery } from "@/server/delivery";
import { parseJson, route } from "@/server/http";

const Body = z.object({
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().min(1).max(5) })).min(1).max(10),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const POST = route(async (req) => {
  const { items, lat, lng } = await parseJson(req, Body);
  return { quote: await quoteDelivery(items, { lat, lng }) };
});
