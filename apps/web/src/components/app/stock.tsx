"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { formatEgp } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";
import { useAvailable, useLiveStock } from "@/stores/live";

/** Units left at the selected fridge, live. */
export function useProductStock(product: ProductDTO) {
  const machineId = product.stock?.machineId ?? null;
  const available = useAvailable(machineId, product.sku, product.stock?.available);
  const changedAt = useLiveStock((s) => (machineId ? s.changedAt[`${machineId}:${product.sku}`] : undefined));
  return { available, changedAt };
}

export function StockBadge({ product, className }: { product: ProductDTO; className?: string }) {
  const { available, changedAt } = useProductStock(product);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!changedAt) return;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1600);
    return () => clearTimeout(t);
  }, [changedAt]);

  if (available === null) return null;
  const text = available === 0 ? "Sold out here" : available === 1 ? "Last one!" : available <= 3 ? `Only ${available} left` : `${available} left`;
  const tone =
    available === 0 ? "bg-cream-deep text-muted" : available <= 3 ? "bg-tomato text-white" : "bg-forest/10 text-forest";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold transition",
        tone,
        pulse && "ring-4 ring-sun/70",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", available === 0 ? "bg-muted" : available <= 3 ? "bg-white" : "bg-forest", "animate-pulse")} />
      {text}
    </span>
  );
}

export function Price({ product, className, large }: { product: ProductDTO; className?: string; large?: boolean }) {
  const discounted = product.appPriceCents < product.priceCents;
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <span className={cn("font-display tracking-wide text-forest-dark", large ? "text-3xl" : "text-lg")}>
        {formatEgp(product.appPriceCents)}
      </span>
      {discounted && <span className={cn("text-muted line-through", large ? "text-sm" : "text-[11px]")}>{formatEgp(product.priceCents, { compact: true })}</span>}
    </span>
  );
}
