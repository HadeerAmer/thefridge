import Link from "next/link";
import { LiveFeed } from "@/components/admin/admin-live";
import { SalesChart } from "@/components/admin/sales-chart";
import { AdminTitle, Kpi, Panel } from "@/components/admin/ui";
import { formatEgp } from "@/lib/money";
import { overview } from "@/server/admin";
import { connectDb } from "@/server/db/mongo";

export const metadata = { title: "Overview" };

export default async function AdminOverview() {
  await connectDb();
  const data = await overview();
  const k = data.kpis;

  return (
    <div className="grid gap-6">
      <AdminTitle title="Today at The Fridge" subtitle="Live across every machine — updates as fridges report in." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Orders today" value={String(k.ordersToday)} hint={`${k.newCustomers} new member${k.newCustomers === 1 ? "" : "s"}`} />
        <Kpi label="Revenue today" value={formatEgp(k.revenueCents)} hint={`${k.appSharePercent}% through the app`} tone="good" />
        <Kpi label="Avg basket" value={formatEgp(k.avgBasketCents)} />
        <Kpi label="Live holds" value={String(k.activeHolds)} hint={`${k.activeDeliveries} deliveries in progress`} />
        <Kpi label="Machines selling" value={`${k.machinesOnline}/${k.machinesTotal}`} tone={k.machinesOnline < k.machinesTotal ? "alert" : "default"} />
        <Kpi label="Issues open" value={String(k.openIssues)} hint={`${k.lowStock} items low`} tone={k.openIssues > 0 ? "alert" : "default"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Panel title="Sales by hour">
          <SalesChart data={data.salesByHour} />
        </Panel>
        <Panel title="Live activity" action={<span className="flex items-center gap-1.5 text-xs text-muted"><span className="size-2 animate-pulse rounded-full bg-leaf" /> live</span>}>
          <LiveFeed initial={data.feed} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Machine alerts" action={<Link href="/admin/machines" className="text-sm font-semibold text-forest">Machines →</Link>}>
          {data.alerts.length === 0 ? (
            <p className="text-sm text-muted">All machines selling normally. ✅</p>
          ) : (
            <ul className="grid gap-2">
              {data.alerts.map((a) => (
                <li key={a.machineId} className={`rounded-xl px-3 py-2 text-sm ${a.severity === "high" ? "bg-[#fde3da] text-[#9c2b10]" : "bg-sun/25"}`}>
                  <strong>{a.machine}</strong> — {a.text}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Restock soon">
          {data.lowStock.length === 0 ? (
            <p className="text-sm text-muted">Nothing running low.</p>
          ) : (
            <ul className="grid gap-1.5 text-sm">
              {data.lowStock.map((s) => (
                <li key={`${s.machineId}-${s.sku}`} className="flex justify-between gap-2">
                  <span className="truncate">
                    {s.product} <span className="text-muted">· {s.machine}</span>
                  </span>
                  <span className={`shrink-0 ${s.available === 0 ? "font-bold text-tomato" : "font-semibold text-orange"}`}>
                    {s.available === 0 ? "sold out" : `${s.available} left`}
                    {s.held > 0 && <span className="font-normal text-muted"> (+{s.held} held)</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Top sellers · 7 days">
          {data.topProducts.length === 0 ? (
            <p className="text-sm text-muted">No sales yet.</p>
          ) : (
            <ol className="grid gap-1.5 text-sm">
              {data.topProducts.map((t, i) => (
                <li key={t.name} className="flex justify-between gap-2">
                  <span className="truncate">
                    <span className="mr-2 font-display text-forest">{i + 1}</span>
                    {t.name}
                  </span>
                  <span className="shrink-0 text-muted">
                    {t.qty} sold · {formatEgp(t.revenueCents)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
