"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShoppingBag } from "lucide-react";
import { formatEgp } from "@/lib/money";
import type { ProductDTO } from "@/lib/types";
import { cartCount, useCart } from "@/stores/cart";

/** Floating cart pill above the bottom nav — visible whenever the cart has items. */
export function CartButton({ products }: { products: ProductDTO[] }) {
  const lines = useCart((s) => s.lines);
  const pathname = usePathname();
  const count = cartCount(lines);
  if (count === 0 || pathname.startsWith("/checkout")) return null;

  const bySku = new Map(products.map((p) => [p.sku, p]));
  const total = lines.reduce((sum, l) => sum + (bySku.get(l.sku)?.appPriceCents ?? 0) * l.qty, 0);

  return (
    <Link
      href="/checkout"
      className="fixed inset-x-0 bottom-20 z-30 mx-auto flex w-[calc(100%-2rem)] max-w-[448px] animate-rise items-center justify-between rounded-2xl bg-forest-ink px-4 py-3 text-white shadow-float"
    >
      <span className="flex items-center gap-2 font-semibold">
        <span className="relative">
          <ShoppingBag className="size-5" />
          <span className="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-sun text-[10px] text-forest-ink">{count}</span>
        </span>
        View cart
      </span>
      <span className="font-display text-lg tracking-wide">{formatEgp(total)}</span>
    </Link>
  );
}
