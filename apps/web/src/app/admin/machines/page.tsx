import { MachineNoticeForm } from "@/components/admin/machine-notice-form";
import { ActionButton, AdminTitle, StatusDot } from "@/components/admin/ui";
import { relativeTime } from "@/lib/dates";
import { machinesWithStock } from "@/server/admin";
import { connectDb } from "@/server/db/mongo";
import { syncMachineAction } from "../actions";

export const metadata = { title: "Machines" };

export default async function AdminMachines() {
  await connectDb();
  const machines = await machinesWithStock();
  const now = Date.now();

  return (
    <div>
      <AdminTitle
        title="Machines & stock"
        subtitle="Stock is the machines' own count (on hand), minus units held for app orders. Updated by signed webhooks."
        action={
          <a href="http://localhost:4000" target="_blank" rel="noreferrer" className="text-sm font-semibold text-forest underline">
            Open the fridge simulator ↗
          </a>
        }
      />
      <div className="grid gap-5 xl:grid-cols-2">
        {machines.map((m) => {
          const tone = m.isSeasonal ? "grey" : m.status !== "online" ? "red" : m.salesLocked ? "amber" : "green";
          const units = m.stock.reduce((s, x) => s + x.available, 0);
          return (
            <section key={m.id} className="rounded-[22px] border border-line bg-paper p-5 shadow-card">
              <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <StatusDot tone={tone} /> {m.name}
                  </h2>
                  <p className="text-xs text-muted">
                    {m.area} · {m.hours} · {m.isSeasonal ? "seasonal (closed)" : m.status}
                    {m.status === "online" && ` · ${m.temperatureC.toFixed(1)}°C`}
                    {m.lastSeenAt && ` · seen ${relativeTime(m.lastSeenAt)}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-cream px-3 py-1 text-sm font-semibold">{units} available</span>
                  {!m.isSeasonal && <ActionButton action={syncMachineAction.bind(null, m.id)}>Re-sync</ActionButton>}
                </div>
              </header>

              {!m.isSeasonal && <MachineNoticeForm machineId={m.id} notice={m.notice} />}

              {!m.isSeasonal && (
                <div className="mt-4 max-h-72 overflow-y-auto rounded-xl border border-line">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-cream text-left text-xs text-muted uppercase">
                      <tr>
                        <th className="px-3 py-2">Product</th>
                        <th className="px-2 py-2">Slots</th>
                        <th className="px-2 py-2 text-right">On hand</th>
                        <th className="px-2 py-2 text-right">Held</th>
                        <th className="px-3 py-2 text-right">Available</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {m.stock.map((s) => {
                        const expiringSoon = s.nearestExpiry && Date.parse(s.nearestExpiry) - now < 6 * 3_600_000;
                        return (
                          <tr key={s.sku} className={s.available === 0 ? "bg-[#fde3da]/40" : ""}>
                            <td className="px-3 py-1.5">
                              {s.name}
                              {expiringSoon && <span className="ml-1 text-xs text-orange">⏱ expiring</span>}
                            </td>
                            <td className="px-2 py-1.5 text-xs text-muted">{s.slots.join(", ")}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{s.onHand}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-orange">{s.held || ""}</td>
                            <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${s.available <= 1 ? "text-tomato" : ""}`}>{s.available}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {m.isSeasonal && <p className="mt-3 text-sm text-muted">📢 {m.notice ?? "Closed for the season."}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
