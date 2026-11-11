"use client";

import Link from "next/link";
import { Bell, Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useMe } from "@/lib/queries";
import type { ProductDTO } from "@/lib/types";
import { useCart } from "@/stores/cart";
import { ProductArt } from "../brand/product-art";
import { Sticker } from "../brand/brand";
import { Price, StockBadge, useProductStock } from "./stock";

export function ProductCard({ product, className }: { product: ProductDTO; className?: string }) {
  const { available } = useProductStock(product);
  const add = useCart((s) => s.add);
  const soldOut = available === 0;

  return (
    <Link
      href={`/p/${product.slug}`}
      className={cn(
        "group relative flex flex-col rounded-[22px] border border-line bg-paper p-2.5 shadow-card transition hover:-translate-y-0.5",
        className,
      )}
    >
      <div className={cn("relative aspect-square overflow-hidden rounded-2xl bg-cream", soldOut && "opacity-60 grayscale-[35%]")}>
        <ProductArt category={product.category} layers={product.art.layers} accent={product.art.accent} label={product.shortName} className="size-full" />
        <div className="absolute top-1.5 left-1.5 flex flex-col items-start gap-1">
          {product.promo?.kind === "fresh_saver" && (
            <Sticker tone="tomato" className="size-12" rotate={-10}>
              Fresh saver
            </Sticker>
          )}
          {product.promo?.kind === "happy_hour" && (
            <Sticker tone="orange" className="size-12" rotate={-10}>
              Happy hour
            </Sticker>
          )}
          {product.isNewArrival && (
            <Sticker tone="sun" className="size-11" rotate={8}>
              New
            </Sticker>
          )}
        </div>
        {product.nutrition.source === "label" && (
          <span className="absolute right-1.5 bottom-1.5 rounded-full bg-paper/90 px-1.5 py-0.5 text-[9px] font-bold text-forest">
            ✓ label macros
          </span>
        )}
      </div>

      <div className="mt-2 flex min-h-5 items-center">
        <StockBadge product={product} />
      </div>
      <h3 className="mt-1 line-clamp-2 text-[14px] leading-tight font-semibold">{product.name}</h3>
      <p className="mt-0.5 text-[11px] text-muted">
        {product.nutrition.kcal} kcal · {Math.round(product.nutrition.proteinG)} g protein
      </p>
      <div className="mt-auto flex items-end justify-between gap-1 pt-2">
        <Price product={product} />
        {soldOut ? <NotifyButton product={product} /> : (
          <button
            type="button"
            aria-label={`Add ${product.name} to cart`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              add(product.sku);
              toast.success(`${product.shortName} added`, { duration: 1500 });
            }}
            className="grid size-9 shrink-0 place-items-center rounded-full bg-forest text-white shadow-[0_6px_14px_-6px_rgba(20,61,35,0.7)] transition active:scale-90"
          >
            <Plus className="size-5" />
          </button>
        )}
      </div>
    </Link>
  );
}

export function NotifyButton({ product, full = false }: { product: ProductDTO; full?: boolean }) {
  const { data: me } = useMe();
  async function notify(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!me) {
      toast("Sign in to get back-in-stock alerts");
      return;
    }
    await api("/api/alerts", { method: "POST", json: { sku: product.sku, machineId: product.stock?.machineId ?? null } });
    toast.success("We'll tell you the moment it's back");
  }
  return full ? (
    <button type="button" onClick={notify} className="inline-flex h-11 items-center gap-2 rounded-2xl border border-forest px-4 font-semibold text-forest">
      <Bell className="size-4" /> Notify me when it's back
    </button>
  ) : (
    <button
      type="button"
      aria-label={`Notify me when ${product.name} is back`}
      onClick={notify}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-forest/30 bg-paper text-forest"
    >
      <Bell className="size-4" />
    </button>
  );
}
