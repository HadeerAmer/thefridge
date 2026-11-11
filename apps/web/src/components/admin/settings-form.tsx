"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettingsAction } from "@/app/admin/actions";
import { cn } from "@/lib/cn";
import type { Settings } from "@/server/settings";
import { Button } from "../ui/button";

type Path = [keyof Settings, ...string[]];

function setIn<T>(obj: T, path: string[], value: unknown): T {
  const [head, ...rest] = path;
  const current = (obj as Record<string, unknown>)[head!];
  return { ...obj, [head!]: rest.length ? setIn(current, rest, value) : value } as T;
}

function getIn(obj: unknown, path: string[]): unknown {
  return path.reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], obj);
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const [s, setS] = useState(initial);
  const [pending, start] = useTransition();
  const update = (path: Path, value: unknown) => setS((prev) => setIn(prev, path as string[], value));

  const num = (path: Path, label: string, opts: { suffix?: string; cents?: boolean; step?: number; hint?: string } = {}) => {
    const raw = getIn(s, path as string[]) as number;
    const shown = opts.cents ? raw / 100 : raw;
    return (
      <label className="grid gap-1 text-sm">
        <span className="font-semibold">{label}</span>
        <span className="flex items-center gap-2">
          <input
            type="number"
            step={opts.step ?? 1}
            value={shown}
            onChange={(e) => update(path, opts.cents ? Math.round(Number(e.target.value) * 100) : Number(e.target.value))}
            className="h-10 w-28 rounded-xl border border-line bg-white px-3 tabular-nums outline-none focus:border-forest"
          />
          {opts.suffix && <span className="text-muted">{opts.suffix}</span>}
        </span>
        {opts.hint && <span className="text-xs text-muted">{opts.hint}</span>}
      </label>
    );
  };

  const toggle = (path: Path, label: string, hint?: string) => {
    const on = Boolean(getIn(s, path as string[]));
    return (
      <div className="flex items-start justify-between gap-3 text-sm">
        <span>
          <span className="font-semibold">{label}</span>
          {hint && <span className="block text-xs text-muted">{hint}</span>}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={label}
          onClick={() => update(path, !on)}
          className={cn("relative h-6 w-11 shrink-0 rounded-full transition", on ? "bg-forest" : "bg-line")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition", on ? "left-[22px]" : "left-0.5")} />
        </button>
      </div>
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await saveSettingsAction(s);
          if (result.ok) toast.success(result.message ?? "Saved");
          else toast.error(result.message);
        });
      }}
      className="grid gap-6"
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Reservations" note="How long a reserved item is locked in the fridge for the customer.">
          {num(["reservation", "holdMinutes"], "Hold reserved items for", { suffix: "minutes", hint: "The deck suggested 10–15 min. Applies to new reservations." })}
          {num(["reservation", "maxActivePerUser"], "Active reservations per member", { suffix: "at a time" })}
        </Section>

        <Section title="Pricing & promotions" note="Item promos don't stack — the best one wins. Combo and student discounts apply on top.">
          {num(["pricing", "appDiscountPercent"], "App-only price", { suffix: "% below machine price" })}
          {toggle(["pricing", "happyHour", "enabled"], "Happy hour", "Off-peak discount window (Cairo time)")}
          <div className="flex flex-wrap gap-4">
            {num(["pricing", "happyHour", "startHour"], "From", { suffix: ":00" })}
            {num(["pricing", "happyHour", "endHour"], "To", { suffix: ":00" })}
            {num(["pricing", "happyHour", "percent"], "Discount", { suffix: "%" })}
          </div>
          {toggle(["pricing", "freshSaver", "enabled"], "Fresh-saver markdowns", "Cut the price as items near their expiry — less waste")}
          <div className="flex flex-wrap gap-4">
            {num(["pricing", "freshSaver", "hoursBeforeExpiry"], "When within", { suffix: "hours" })}
            {num(["pricing", "freshSaver", "percent"], "Discount", { suffix: "%" })}
          </div>
          {toggle(["pricing", "combo", "enabled"], "Main + drink combo")}
          {num(["pricing", "combo", "drinkDiscountCents"], "Combo saving", { suffix: "EGP off the drink", cents: true })}
          {num(["pricing", "studentPercent"], "Student discount", { suffix: "% (verified university email)" })}
        </Section>

        <Section title="Loyalty" note="Points, streaks and the stamp card.">
          {toggle(["loyalty", "enabled"], "Loyalty programme on")}
          {num(["loyalty", "pointsPerEgp"], "Points per EGP", { step: 0.5 })}
          {toggle(["loyalty", "weekendFreeze"], "Weekends don't break streaks", "Friday and Saturday are rest days")}
          {num(["loyalty", "stampCardSize"], "Stamp card: free meal every", { suffix: "meals (0 = off)" })}
          {num(["loyalty", "signupBonusPoints"], "Welcome bonus", { suffix: "points" })}
          <p className="text-xs text-muted">
            Streak bonuses: {s.loyalty.streakMilestones.map((m) => `${m.days} days → +${m.points}`).join(" · ")}
          </p>
        </Section>

        <Section title="Delivery" note="Delivered from the nearest fridge that has every item.">
          {toggle(["delivery", "enabled"], "Delivery available")}
          {num(["delivery", "holdMinutes"], "Hold for courier", { suffix: "minutes" })}
          <div className="flex flex-wrap gap-4">
            {num(["delivery", "baseFeeCents"], "Base fee", { suffix: "EGP", cents: true })}
            {num(["delivery", "perKmCents"], "Per km after 2 km", { suffix: "EGP", cents: true })}
          </div>
          <div className="flex flex-wrap gap-4">
            {num(["delivery", "maxKm"], "Max distance", { suffix: "km" })}
            {num(["delivery", "freeOverCents"], "Free delivery over", { suffix: "EGP", cents: true })}
          </div>
          {toggle(["delivery", "autoDispatch"], "Auto-dispatch (demo)", "Simulated drivers move orders along automatically")}
          {num(["delivery", "demoSpeed"], "Demo speed", { suffix: "× faster", step: 0.5 })}
        </Section>
      </div>
      <div className="sticky bottom-4 flex justify-end">
        <Button type="submit" size="lg" loading={pending} className="shadow-float">
          Save settings
        </Button>
      </div>
    </form>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="grid content-start gap-4 rounded-[22px] border border-line bg-paper p-5 shadow-card">
      <div>
        <h2 className="font-display text-xl tracking-wide text-forest-dark uppercase">{title}</h2>
        {note && <p className="text-xs text-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}
