"use client";

import Link from "next/link";
import { Flame, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { LoyaltyDTO, Nutrition, RewardDTO, StreakDay, TargetsDTO } from "@/lib/types";

export function Ring({
  value,
  max,
  size = 112,
  stroke = 12,
  color = "#1f5a34",
  track = "#efe6d6",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

const MACROS = [
  { key: "proteinG", label: "Protein", color: "#1f5a34" },
  { key: "carbsG", label: "Carbs", color: "#f6c62f" },
  { key: "fatG", label: "Fat", color: "#e2481f" },
] as const;

export function MacroSummary({ consumed, targets, compact = false }: { consumed: Nutrition; targets: TargetsDTO; compact?: boolean }) {
  const left = Math.max(0, targets.kcal - consumed.kcal);
  return (
    <div className="flex items-center gap-4">
      <Ring value={consumed.kcal} max={targets.kcal} size={compact ? 96 : 112} stroke={compact ? 10 : 12} color="#f26b21">
        <div>
          <div className="font-display text-2xl leading-none text-forest-dark">{consumed.kcal.toLocaleString()}</div>
          <div className="text-[10px] text-muted">of {targets.kcal.toLocaleString()} kcal</div>
          {!compact && <div className="mt-0.5 text-[10px] font-semibold text-forest">{left.toLocaleString()} left</div>}
        </div>
      </Ring>
      <div className="grid min-w-0 flex-1 gap-2.5">
        {MACROS.map((m) => {
          const value = consumed[m.key];
          const target = targets[m.key];
          return (
            <div key={m.key}>
              <div className="flex justify-between text-xs">
                <span className="font-semibold">{m.label}</span>
                <span className="text-muted tabular-nums">
                  {Math.round(value)} / {target} g
                </span>
              </div>
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-cream-deep">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, (value / Math.max(1, target)) * 100)}%`, background: m.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function StreakWeek({ week, className }: { week: StreakDay[]; className?: string }) {
  return (
    <ol className={cn("flex justify-between gap-1", className)}>
      {week.map((d) => (
        <li key={d.day} className="flex flex-col items-center gap-1">
          <span
            title={d.status}
            className={cn(
              "grid size-8 place-items-center rounded-full text-xs font-bold",
              d.status === "done" && "bg-forest text-white",
              d.status === "rest" && "bg-cream-deep text-muted",
              d.status === "missed" && "border border-dashed border-line text-muted",
              d.status === "today" && "border-2 border-sun bg-sun/20 text-forest-ink",
            )}
          >
            {d.status === "done" ? "✓" : d.status === "rest" ? "z" : ""}
          </span>
          <span className={cn("text-[10px] font-semibold", d.status === "today" ? "text-forest" : "text-muted")}>{d.label}</span>
        </li>
      ))}
    </ol>
  );
}

export function nextReward(points: number, rewards: RewardDTO[] = []) {
  const sorted = [...rewards].sort((a, b) => a.costPoints - b.costPoints);
  return sorted.find((r) => r.costPoints > points) ?? sorted[sorted.length - 1] ?? null;
}

export function PointsBar({ loyalty, rewards }: { loyalty: LoyaltyDTO; rewards?: RewardDTO[] }) {
  const target = nextReward(loyalty.points, rewards);
  const pct = target ? Math.min(100, (loyalty.points / target.costPoints) * 100) : rewards ? 100 : 0;
  const missing = target ? Math.max(0, target.costPoints - loyalty.points) : 0;
  return (
    <Link href="/rewards" className="block">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-semibold">
          <Star className="size-3.5 fill-sun text-sun" />
          {loyalty.points.toLocaleString()} pts
          <span className="rounded-full bg-forest/10 px-1.5 py-0.5 text-[10px] text-forest">{loyalty.tier.name}</span>
        </span>
        <span className="text-muted">
          {target ? (missing > 0 ? `${missing} to ${target.name}` : `Redeem ${target.name}!`) : "Keep going"}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-cream-deep">
        <div className="h-full rounded-full bg-gradient-to-r from-sun to-orange transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
    </Link>
  );
}

export function StreakHeadline({ loyalty }: { loyalty: LoyaltyDTO }) {
  const { count, alive } = loyalty.streak;
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold">
      <Flame className={cn("size-4", alive && count > 0 ? "fill-orange text-orange" : "text-muted")} />
      {alive && count > 0 ? `${count}-day streak` : "Start a streak today"}
      <span className="text-xs font-normal text-muted">· weekends don't break it</span>
    </div>
  );
}
