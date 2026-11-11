import Link from "next/link";
import { AdminTitle } from "@/components/admin/ui";
import { PAYMENT_LABEL, STATUS_LABEL, statusTone } from "@/components/app/order-status";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { adminOrders } from "@/server/admin";
import { connectDb } from "@/server/db/mongo";

export const metadata = { title: "Orders" };

const FILTERS = [
  { key: "all", label: "All", query: {} },
  { key: "active", label: "Active", query: { status: "active" } },
  { key: "pickup", label: "Pickup", query: { fulfillment: "pickup" } },
  { key: "delivery", label: "Delivery", query: { fulfillment: "delivery" } },
  { key: "walk_up", label: "Walk-up", query: { fulfillment: "walk_up" } },
] as const;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f = "all" } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];
  await connectDb();
  const orders = await adminOrders(filter.query);

  return (
    <div>
      <AdminTitle title="Orders" subtitle="App reservations, deliveries and walk-up sales from the machines." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={`/admin/orders?f=${x.key}`}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", x.key === filter.key ? "border-forest bg-forest text-white" : "border-line bg-paper")}
          >
            {x.label}
          </Link>
        ))}
      </div>
      <div className="overflow-x-auto rounded-[22px] border border-line bg-paper shadow-card">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="bg-cream text-left text-xs text-muted uppercase">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-3 py-3">When</th>
              <th className="px-3 py-3">Customer</th>
              <th className="px-3 py-3">Fridge</th>
              <th className="px-3 py-3">Items</th>
              <th className="px-3 py-3">Payment</th>
              <th className="px-3 py-3 text-right">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {orders.map((o) => (
              <tr key={o.id} className="align-top">
                <td className="px-4 py-2.5 font-semibold">
                  {o.number}
                  <span className="block text-xs font-normal text-muted">{o.fulfillment.replace("_", "-")}</span>
                </td>
                <td className="px-3 py-2.5 text-muted">{relativeTime(o.createdAt)}</td>
                <td className="px-3 py-2.5">{o.customer?.name ?? <span className="text-muted">Walk-up</span>}</td>
                <td className="px-3 py-2.5">{o.machine.name}</td>
                <td className="max-w-[260px] px-3 py-2.5">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</td>
                <td className="px-3 py-2.5">
                  {PAYMENT_LABEL[o.payment.method]}
                  <span className="block text-xs text-muted">{o.payment.status}</span>
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatEgp(o.totals.totalCents)}</td>
                <td className="px-4 py-2.5">
                  <Badge tone={statusTone(o.status)}>{STATUS_LABEL[o.status]}</Badge>
                </td>
              </tr>
            ))}
            {orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-muted">
                  No orders here yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
