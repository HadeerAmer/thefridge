import { CreditButton } from "@/components/admin/credit-button";
import { AdminTitle } from "@/components/admin/ui";
import { relativeTime } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { customers } from "@/server/admin";
import { connectDb } from "@/server/db/mongo";

export const metadata = { title: "Customers" };

export default async function AdminCustomers() {
  await connectDb();
  const rows = await customers();
  return (
    <div>
      <AdminTitle title="Customers" subtitle="Members, their loyalty status and wallet. Credit a wallet as a goodwill gesture." />
      <div className="overflow-x-auto rounded-[22px] border border-line bg-paper shadow-card">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-cream text-left text-xs text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Member</th>
              <th className="px-3 py-3">Tier</th>
              <th className="px-3 py-3 text-right">Points</th>
              <th className="px-3 py-3 text-right">Streak</th>
              <th className="px-3 py-3 text-right">Orders</th>
              <th className="px-3 py-3 text-right">Spend</th>
              <th className="px-3 py-3 text-right">Wallet</th>
              <th className="px-3 py-3">Last order</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((c) => (
              <tr key={c.id}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{c.name}</span>
                  {c.student && <span className="ml-1 text-xs">🎓</span>}
                  <span className="block text-xs text-muted">{c.phone}</span>
                </td>
                <td className="px-3 py-2.5">{c.tier}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.points.toLocaleString()}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.streak > 0 ? `${c.streak}🔥` : "—"}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{c.orders}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{formatEgp(c.spendCents)}</td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatEgp(c.walletCents)}</td>
                <td className="px-3 py-2.5 text-muted">{c.lastOrderAt ? relativeTime(c.lastOrderAt) : "—"}</td>
                <td className="px-4 py-2.5 text-right">
                  <CreditButton userId={c.id} name={c.name} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
