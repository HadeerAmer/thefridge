"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Bar, BarChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { shortTime } from "@/lib/dates";
import { keys, useMe, useMenu, useToday } from "@/lib/queries";
import { useLocationStore } from "@/stores/location";
import { Mascot } from "../brand/brand";
import { ProductArt } from "../brand/product-art";
import { PageHeader } from "../app/header";
import { MacroSummary } from "../app/progress";
import { Button, ButtonLink } from "../ui/button";
import { Card, EmptyState, SectionTitle, Skeleton } from "../ui/primitives";
import { Sheet } from "../ui/sheet";

export function NutritionScreen() {
  const { data: me, isLoading } = useMe();
  const { data, isLoading: loadingToday } = useToday(Boolean(me));
  const qc = useQueryClient();
  const [logOpen, setLogOpen] = useState(false);

  if (!isLoading && !me) {
    return (
      <div>
        <PageHeader title="Progress" />
        <EmptyState
          art={<Mascot className="h-28 w-24" />}
          title="Track your good calories"
          body="Everything you collect from The Fridge is logged automatically — calories, protein, carbs and fat."
          action={<ButtonLink href="/signin?next=/nutrition">Sign in</ButtonLink>}
        />
      </div>
    );
  }
  if (!me || loadingToday || !data) return <Skeleton className="m-4 h-72" />;

  const { today, week } = data;
  const daysWithFood = week.filter((d) => d.kcal > 0);
  const proteinHits = week.filter((d) => d.proteinG >= today.targets.proteinG * 0.8).length;
  const avgKcal = daysWithFood.length ? Math.round(daysWithFood.reduce((s, d) => s + d.kcal, 0) / daysWithFood.length) : 0;

  async function remove(id: string) {
    await api(`/api/nutrition/${id}`, { method: "DELETE" });
    void qc.invalidateQueries({ queryKey: keys.today });
  }

  return (
    <div className="pb-10">
      <PageHeader title="Progress" action={<Button size="sm" onClick={() => setLogOpen(true)}><Plus className="size-4" /> Log</Button>} />
      <div className="grid gap-5 px-4">
        <Card className="p-4">
          <SectionTitle className="mb-3" action={<span className="text-xs text-muted">{today.targets.basis === "profile" ? "Targets from your profile" : today.targets.basis === "custom" ? "Your custom targets" : "Default targets"}</span>}>
            Today
          </SectionTitle>
          <MacroSummary consumed={today.consumed} targets={today.targets} />
          <Link href="/profile" className="mt-3 block text-xs font-semibold text-forest">
            Adjust goals →
          </Link>
        </Card>

        <Card className="p-4">
          <SectionTitle className="mb-1">This week</SectionTitle>
          <p className="mb-3 text-xs text-muted">
            Avg {avgKcal.toLocaleString()} kcal on days you ate with us · protein goal hit {proteinHits}/7 days
          </p>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={week} margin={{ top: 6, right: 4, left: -18, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#5d6b61" }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10, fill: "#5d6b61" }} />
                <Tooltip
                  cursor={{ fill: "rgba(31,90,52,0.06)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e8dfcf", fontSize: 12 }}
                  formatter={(value) => [`${value ?? 0} kcal`, "Calories"]}
                />
                <ReferenceLine y={today.targets.kcal} stroke="#f26b21" strokeDasharray="4 4" />
                <Bar dataKey="kcal" fill="#1f5a34" radius={[8, 8, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-1 text-[11px] text-muted">Dashed line = your daily calorie target ({today.targets.kcal.toLocaleString()} kcal)</p>
        </Card>

        <section>
          <SectionTitle>Today's log</SectionTitle>
          {today.entries.length === 0 ? (
            <Card className="p-5 text-center text-sm text-muted">Nothing yet today. Collect a meal and it appears here automatically.</Card>
          ) : (
            <ul className="grid gap-2">
              {today.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-cream text-lg">{e.source === "order" ? "🧊" : "✍️"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {e.qty > 1 ? `${e.qty}× ` : ""}
                      {e.name}
                    </p>
                    <p className="text-xs text-muted">
                      {e.kcal} kcal · P {e.proteinG} g · C {e.carbsG} g · F {e.fatG} g · {shortTime(e.eatenAt)}
                    </p>
                  </div>
                  <button type="button" aria-label="Remove" onClick={() => remove(e.id)} className="grid size-8 place-items-center rounded-full text-muted hover:bg-cream">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <LogSheet open={logOpen} onOpenChange={setLogOpen} />
    </div>
  );
}

/** Quick "I ate this" from the menu (e.g. bought with cash at the machine). */
function LogSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const machineId = useLocationStore((s) => s.machineId);
  const { data: menu } = useMenu(machineId);
  const qc = useQueryClient();

  async function log(productId: string, name: string) {
    await api("/api/nutrition", { method: "POST", json: { productId, qty: 1 } });
    toast.success(`${name} logged`);
    void qc.invalidateQueries({ queryKey: keys.today });
    onOpenChange(false);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Log a meal" description="Bought at the machine with cash? Add it here.">
      <ul className="grid grid-cols-2 gap-2">
        {(menu?.products ?? []).map((p) => (
          <li key={p.sku}>
            <button type="button" onClick={() => log(p.id, p.name)} className="flex w-full items-center gap-2 rounded-2xl border border-line bg-paper p-2 text-left">
              <span className="size-10 shrink-0 rounded-lg bg-cream">
                <ProductArt category={p.category} layers={p.art.layers} accent={p.art.accent} className="size-full" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">{p.shortName}</span>
                <span className="block text-[11px] text-muted">{p.nutrition.kcal} kcal</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
