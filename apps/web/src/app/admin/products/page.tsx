import { ProductRow } from "@/components/admin/product-row";
import { AdminTitle } from "@/components/admin/ui";
import { productsWithStock } from "@/server/admin";
import { connectDb } from "@/server/db/mongo";
import { getSettings } from "@/server/settings";

export const metadata = { title: "Products" };

export default async function AdminProducts() {
  await connectDb();
  const [products, settings] = await Promise.all([productsWithStock(), getSettings()]);
  return (
    <div>
      <AdminTitle
        title="Products & prices"
        subtitle={`Menu price is what the machine charges. App customers pay ${settings.pricing.appDiscountPercent}% less (change in Settings).`}
      />
      <div className="overflow-x-auto rounded-[22px] border border-line bg-paper shadow-card">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-cream text-left text-xs text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-3 py-3">Category</th>
              <th className="px-3 py-3">Macros</th>
              <th className="px-3 py-3 text-right">In fleet</th>
              <th className="px-3 py-3">Menu price (EGP)</th>
              <th className="px-4 py-3">On menu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {products.map((p) => (
              <ProductRow key={p.id} product={p} appDiscountPercent={settings.pricing.appDiscountPercent} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
