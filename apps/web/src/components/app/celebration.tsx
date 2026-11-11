"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { formatEgp } from "@/lib/money";
import type { Celebration, OrderDTO } from "@/lib/types";
import { Mascot } from "../brand/brand";
import { Button } from "../ui/button";

type State = {
  current: { order: OrderDTO; celebration: Celebration } | null;
  show: (value: { order: OrderDTO; celebration: Celebration }) => void;
  close: () => void;
};

export const useCelebration = create<State>()((set) => ({
  current: null,
  show: (current) => set({ current }),
  close: () => set({ current: null }),
}));

const CONFETTI = ["#f6c62f", "#e2481f", "#a9c46c", "#2d6cb5", "#f26b21", "#1f5a34"];

/** Full-screen "Enjoy!" moment when the fridge confirms your order dropped. */
export function CelebrationHost() {
  const { current, close } = useCelebration();

  useEffect(() => {
    if (!current) return;
    const timer = setTimeout(close, 9000);
    return () => clearTimeout(timer);
  }, [current, close]);

  if (!current) return null;
  const { order, celebration } = current;
  const totalPoints = celebration.points + celebration.bonus;
  const items = order.items.map((i) => `${i.qty > 1 ? `${i.qty}× ` : ""}${i.name}`).join(", ");

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-forest-ink/55 p-6" role="dialog" aria-modal="true" onClick={close}>
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        {Array.from({ length: 36 }, (_, i) => (
          <span
            key={i}
            className="absolute top-[-20px] block h-3 w-2 rounded-sm"
            style={{
              left: `${(i * 37) % 100}%`,
              background: CONFETTI[i % CONFETTI.length],
              animation: `fall ${2.2 + (i % 5) * 0.35}s ${(i % 7) * 0.12}s ease-in forwards`,
              transform: `rotate(${i * 23}deg)`,
            }}
          />
        ))}
      </div>
      <div className="relative w-full max-w-sm animate-pop rounded-[28px] bg-paper p-6 text-center shadow-float" onClick={(e) => e.stopPropagation()}>
        <Mascot wave className="mx-auto -mt-16 h-28 w-28 drop-shadow" />
        <p className="font-display text-3xl tracking-wide text-forest-dark uppercase">
          {order.fulfillment === "delivery" ? "Delivered!" : "Enjoy!"}
        </p>
        <p className="font-hand text-2xl text-tomato">Always a good cal(l)</p>
        <p className="mt-2 text-sm text-muted">{items}</p>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <Stat value={`+${totalPoints}`} label="points" />
          <Stat value={`${celebration.streak}🔥`} label="day streak" />
          <Stat value={`${Math.round(order.items.reduce((n, i) => n + i.nutrition.proteinG * i.qty, 0))} g`} label="protein logged" />
        </div>
        {celebration.milestone && (
          <p className="mt-4 rounded-2xl bg-sun/40 px-3 py-2 text-sm font-semibold text-forest-ink">
            {celebration.milestone}-day streak milestone! +{celebration.bonus} bonus points
          </p>
        )}
        {celebration.freeMealCents > 0 && (
          <p className="mt-3 rounded-2xl bg-leaf/40 px-3 py-2 text-sm font-semibold text-forest-ink">
            Stamp card complete — {formatEgp(celebration.freeMealCents)} back in your wallet 🎉
          </p>
        )}
        <Button className="mt-5 w-full" onClick={close}>
          Yum, thanks
        </Button>
      </div>
      <style>{`@keyframes fall { to { transform: translateY(110vh) rotate(540deg); } }`}</style>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-cream px-2 py-3">
      <div className="font-display text-2xl text-forest-dark">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
