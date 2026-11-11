import { ActionButton, AdminTitle } from "@/components/admin/ui";
import { relativeTime } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import type { OrderDTO } from "@/lib/types";
import { deliveryBoard } from "@/server/admin";
import { connectDb } from "@/server/db/mongo";
import { getSettings } from "@/server/settings";
import { advanceDeliveryAction } from "../actions";

export const metadata = { title: "Delivery board" };

const COLUMNS: { status: OrderDTO["status"]; title: string; next: string | null }[] = [
  { status: "placed", title: "New", next: "Assign driver" },
  { status: "assigned", title: "Driver assigned", next: "Collect at fridge" },
  { status: "picked_up", title: "Collected", next: "Start trip" },
  { status: "on_the_way", title: "On the way", next: "Mark delivered" },
  { status: "delivered", title: "Delivered today", next: null },
];

export default async function DeliveryBoard() {
  await connectDb();
  const [orders, settings] = await Promise.all([deliveryBoard(), getSettings()]);

  return (
    <div>
      <AdminTitle
        title="Delivery board"
        subtitle={
          settings.delivery.autoDispatch
            ? `Auto-dispatch is on (demo speed ×${settings.delivery.demoSpeed}) — orders move by themselves; you can still push them along.`
            : "Auto-dispatch is off — move each delivery along by hand."
        }
      />
      <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-5">
        {COLUMNS.map((col) => {
          const cards = orders.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className="min-w-[220px] rounded-[20px] bg-cream-deep/70 p-3">
              <h2 className="mb-3 flex items-center justify-between text-sm font-bold tracking-wide text-forest-dark uppercase">
                {col.title} <span className="rounded-full bg-paper px-2 text-xs">{cards.length}</span>
              </h2>
              <div className="grid gap-2">
                {cards.map((o) => (
                  <article key={o.id} className="rounded-2xl border border-line bg-paper p-3 text-sm shadow-card">
                    <p className="flex justify-between font-semibold">
                      {o.number} <span className="text-muted">{formatEgp(o.totals.totalCents)}</span>
                    </p>
                    <p className="text-xs text-muted">{o.customer?.name} · {relativeTime(o.createdAt)}</p>
                    <p className="mt-1 text-xs">{o.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
                    <p className="mt-1 text-xs text-muted">
                      {o.machine.name} → {o.delivery?.address} ({o.delivery?.km} km)
                    </p>
                    {o.delivery?.driver && <p className="mt-1 text-xs">🛵 {o.delivery.driver.name}</p>}
                    {o.delivery?.courierCode && ["placed", "assigned"].includes(o.status) && (
                      <p className="mt-1 rounded-lg bg-sun/30 px-2 py-1 text-xs">
                        Courier code at the fridge: <strong className="tracking-wider">{o.delivery.courierCode}</strong>
                      </p>
                    )}
                    {col.next && (
                      <ActionButton action={advanceDeliveryAction.bind(null, o.id)} variant="primary" className="mt-2 w-full">
                        {col.next} →
                      </ActionButton>
                    )}
                  </article>
                ))}
                {cards.length === 0 && <p className="px-1 text-xs text-muted">Nothing here.</p>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
