import { SettingsForm } from "@/components/admin/settings-form";
import { AdminTitle } from "@/components/admin/ui";
import { connectDb } from "@/server/db/mongo";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Settings" };

export default async function AdminSettings() {
  await connectDb();
  const settings = await getSettings();
  return (
    <div>
      <AdminTitle title="Settings" subtitle="Business rules for reservations, pricing, loyalty and delivery. Changes apply immediately." />
      <SettingsForm initial={settings} />
    </div>
  );
}
