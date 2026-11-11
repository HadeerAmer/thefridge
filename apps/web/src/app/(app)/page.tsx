import { HomeScreen } from "@/components/screens/home-screen";
import { getMenu } from "@/server/catalog";
import { connectDb } from "@/server/db/mongo";
import { listMachineDTOs } from "@/server/machines/service";

export const dynamic = "force-dynamic";

/** Server-renders the menu of the default fridge so the first paint has food on it. */
export default async function HomePage() {
  await connectDb();
  const machines = await listMachineDTOs(null);
  const fallback = machines.find((m) => m.isSelling) ?? null;
  const menu = await getMenu(fallback?.id ?? null);
  return <HomeScreen initialMachines={machines} initialMenu={menu} />;
}
