"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateProductAction } from "@/app/admin/actions";
import { cn } from "@/lib/cn";
import type { Category } from "@/lib/types";
import { ProductArt } from "../brand/product-art";
import { Button } from "../ui/button";

type Row = {
  id: string;
  name: string;
  category: string;
  priceCents: number;
  kcal: number;
  proteinG: number;
  macrosSource: "label" | "estimate";
  isActive: boolean;
  unitsInFleet: number;
  art: { layers: string[]; accent: string };
};

export function ProductRow({ product, appDiscountPercent }: { product: Row; appDiscountPercent: number }) {
  const [price, setPrice] = useState(String(product.priceCents / 100));
  const [pending, start] = useTransition();
  const dirty = Number(price) !== product.priceCents / 100;

  const save = (patch: { priceEgp?: number; isActive?: boolean }) =>
    start(async () => {
      const result = await updateProductAction(product.id, patch);
      if (result.ok) toast.success(result.message ?? "Saved");
      else toast.error(result.message);
    });

  return (
    <tr className={cn(!product.isActive && "opacity-55")}>
      <td className="px-4 py-2">
        <span className="flex items-center gap-3">
          <span className="size-10 shrink-0 rounded-lg bg-cream">
            <ProductArt category={product.category as Category} layers={product.art.layers} accent={product.art.accent} className="size-full" />
          </span>
          <span className="font-medium">{product.name}</span>
        </span>
      </td>
      <td className="px-3 py-2 capitalize text-muted">{product.category}</td>
      <td className="px-3 py-2 text-xs">
        {product.kcal} kcal · {product.proteinG} g P
        <span className={cn("ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold", product.macrosSource === "label" ? "bg-forest/10 text-forest" : "bg-cream-deep text-muted")}>
          {product.macrosSource}
        </span>
      </td>
      <td className={cn("px-3 py-2 text-right tabular-nums", product.unitsInFleet <= 3 && "font-semibold text-tomato")}>{product.unitsInFleet}</td>
      <td className="px-3 py-2">
        <span className="flex items-center gap-2">
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            aria-label={`Price of ${product.name}`}
            className="h-9 w-20 rounded-lg border border-line bg-white px-2 text-right tabular-nums outline-none focus:border-forest"
          />
          {dirty ? (
            <Button size="sm" loading={pending} onClick={() => save({ priceEgp: Number(price) })}>
              Save
            </Button>
          ) : (
            <span className="text-xs text-muted">app {Math.round((product.priceCents / 100) * (1 - appDiscountPercent / 100))}</span>
          )}
        </span>
      </td>
      <td className="px-4 py-2">
        <button
          type="button"
          role="switch"
          aria-checked={product.isActive}
          aria-label={`${product.name} on menu`}
          onClick={() => save({ isActive: !product.isActive })}
          className={cn("relative h-6 w-11 rounded-full transition", product.isActive ? "bg-forest" : "bg-line")}
        >
          <span className={cn("absolute top-0.5 size-5 rounded-full bg-white shadow transition", product.isActive ? "left-[22px]" : "left-0.5")} />
        </button>
      </td>
    </tr>
  );
}
