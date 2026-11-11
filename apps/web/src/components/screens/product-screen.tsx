"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Dumbbell, Leaf, MapPin, Minus, Navigation, Plus, ShoppingBag, TriangleAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import { ALLERGEN_LABELS, TAG_LABELS } from "@/lib/catalog-meta";
import { formatDistance } from "@/lib/geo";
import { formatEgp } from "@/lib/money";
import { useMe, useProduct } from "@/lib/queries";
import { useCart } from "@/stores/cart";
import { useLocationStore } from "@/stores/location";
import { ProductArt } from "../brand/product-art";
import { Sticker } from "../brand/brand";
import { PageHeader } from "../app/header";
import { NotifyButton } from "../app/product-card";
import { Price, StockBadge, useProductStock } from "../app/stock";
import { useQuickReserve } from "../app/use-quick-reserve";
import { Button } from "../ui/button";
import { Badge, Card, SectionTitle, Skeleton } from "../ui/primitives";

export function ProductScreen({ slug }: { slug: string }) {
  const params = useSearchParams();
  const { machineId, coords, setMachine } = useLocationStore();
  const fridgeParam = params.get("fridge");
  useEffect(() => {
    if (fridgeParam) setMachine(fridgeParam);
  }, [fridgeParam, setMachine]);

  const { data, isLoading } = useProduct(slug, fridgeParam ?? machineId, coords);
  const { data: me } = useMe();
  const [qty, setQty] = useState(1);
  const add = useCart((s) => s.add);
  const { reserve, pending } = useQuickReserve();
  const autoReserved = useRef(false);

  const product = data?.product;
  const stock = useProductStock(product ?? ({ sku: "", stock: null } as never));
  const available = product ? stock.available : null;

  // Came back from sign-in with ?reserve=1 → finish the reservation.
  useEffect(() => {
    if (product && me && params.get("reserve") === "1" && !autoReserved.current && (available ?? 0) > 0) {
      autoReserved.current = true;
      void reserve(product, 1);
    }
  }, [product, me, params, available, reserve]);

  if (isLoading || !product) {
    return (
      <div>
        <PageHeader title="" />
        <div className="grid gap-4 px-4">
          <Skeleton className="aspect-square" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  const allergyHits = product.allergens.filter((a) => me?.profile.allergens.includes(a));
  const n = product.nutrition;
  const machineName = data.availability.find((a) => a.machine.id === product.stock?.machineId)?.machine.name;
  const others = data.availability.filter((a) => a.machine.id !== product.stock?.machineId && a.machine.isSelling);

  return (
    <div className="pb-40">
      <PageHeader title={product.shortName} />
      <div className="px-4">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[28px] bg-paper shadow-card">
          <ProductArt category={product.category} layers={product.art.layers} accent={product.art.accent} label={product.shortName} className="mx-auto h-full" />
          <div className="absolute top-3 left-3 flex flex-col gap-2">
            {product.promo && product.promo.kind !== "app" && (
              <Sticker tone={product.promo.kind === "fresh_saver" ? "tomato" : "orange"} className="size-16">
                {product.promo.label}
              </Sticker>
            )}
            {product.isNewArrival && (
              <Sticker tone="sun" className="size-14" rotate={6}>
                New!
              </Sticker>
            )}
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[32px] leading-[1.05] tracking-wide text-forest-dark uppercase">{product.name}</h1>
            <p className="mt-1 text-sm text-muted">{product.description}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Price product={product} large />
          {product.promo && <Badge tone={product.promo.kind === "fresh_saver" ? "tomato" : "green"}>{product.promo.label}</Badge>}
          <StockBadge product={product} />
        </div>
        {product.appPriceCents < product.priceCents && (
          <p className="mt-1 text-xs text-muted">
            {formatEgp(product.priceCents)} at the machine — you save {formatEgp(product.priceCents - product.appPriceCents)} in the app.
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {product.tags.map((t) => (
            <Badge key={t} tone="leaf">
              {TAG_LABELS[t] ?? t}
            </Badge>
          ))}
        </div>

        {allergyHits.length > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-2xl bg-[#fde3da] px-3 py-2 text-sm font-semibold text-[#9c2b10]">
            <TriangleAlert className="size-4" /> Contains {allergyHits.map((a) => ALLERGEN_LABELS[a] ?? a).join(", ")} — on your allergy list
          </p>
        )}

        {/* Nutrition facts, styled like The Fridge's own label posts */}
        <Card className="mt-5 overflow-hidden">
          <div className="flex items-end justify-between bg-forest px-4 py-3 text-white">
            <h2 className="font-display text-2xl tracking-wide uppercase">Nutrition facts</h2>
            <span className="text-xs text-white/75">per {n.weightG >= 300 && product.category === "drink" ? `${n.weightG} ml` : `${n.weightG} g`}</span>
          </div>
          <dl className="divide-y divide-line px-4 font-serif">
            {[
              ["Calories", `${n.kcal} kcal`],
              ["Protein", `${n.proteinG} g`],
              ["Carbs", `${n.carbsG} g`],
              ["Fat", `${n.fatG} g`],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between py-2.5">
                <dt className="text-[17px] italic">{k}</dt>
                <dd className="text-[17px] italic tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-center justify-between gap-2 border-t-[6px] border-forest px-4 py-3 text-xs">
            <span className="text-muted">{n.source === "label" ? "From The Fridge's published label" : "Estimated from ingredients"}</span>
            <span className="flex gap-3 font-bold tracking-wide text-tomato uppercase">
              {n.proteinG >= 20 && (
                <span className="flex items-center gap-1">
                  <Dumbbell className="size-3.5" /> High protein
                </span>
              )}
              <span className="flex items-center gap-1">
                <Leaf className="size-3.5" /> Fresh
              </span>
            </span>
          </div>
        </Card>

        <section className="mt-5">
          <SectionTitle>Ingredients</SectionTitle>
          <p className="text-sm leading-relaxed text-ink/85">{product.ingredients.join(", ")}.</p>
          {product.allergens.length > 0 && (
            <p className="mt-2 text-xs text-muted">Allergens: {product.allergens.map((a) => ALLERGEN_LABELS[a] ?? a).join(", ")}</p>
          )}
        </section>

        <section className="mt-6">
          <SectionTitle>Where to get it</SectionTitle>
          <ul className="grid gap-2">
            {data.availability.map(({ machine, available: units }) => {
              const selected = machine.id === product.stock?.machineId;
              return (
                <li key={machine.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${selected ? "border-forest bg-forest/5" : "border-line bg-paper"}`}>
                  <MapPin className="size-5 shrink-0 text-forest" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{machine.name}</p>
                    <p className="text-xs text-muted">
                      {machine.distanceKm !== null ? `${formatDistance(machine.distanceKm)} · ` : ""}
                      {!machine.isSelling ? "not selling now" : units > 0 ? `${units} left` : "sold out"}
                    </p>
                  </div>
                  {!selected && machine.isSelling && units > 0 && (
                    <Button size="sm" variant="secondary" onClick={() => setMachine(machine.id)}>
                      Pick
                    </Button>
                  )}
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${machine.lat},${machine.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Directions to ${machine.name}`}
                    className="grid size-9 place-items-center rounded-full bg-cream text-forest"
                  >
                    <Navigation className="size-4" />
                  </a>
                </li>
              );
            })}
          </ul>
          {available === 0 && others.some((o) => o.available > 0) && (
            <p className="mt-2 text-xs text-muted">Sold out at {machineName}. Pick another fridge above, or get an alert when it's back.</p>
          )}
        </section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-[480px] border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        {available === 0 ? (
          <div className="flex justify-center">
            <NotifyButton product={product} full />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex h-12 items-center rounded-2xl border border-line">
              <button type="button" aria-label="Less" className="grid size-11 place-items-center" onClick={() => setQty((q) => Math.max(1, q - 1))}>
                <Minus className="size-4" />
              </button>
              <span className="w-6 text-center font-semibold tabular-nums">{qty}</span>
              <button
                type="button"
                aria-label="More"
                className="grid size-11 place-items-center"
                onClick={() => setQty((q) => Math.min(Math.max(1, available ?? 5), 5, q + 1))}
              >
                <Plus className="size-4" />
              </button>
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="px-4"
              aria-label="Add to cart"
              onClick={() => {
                add(product.sku, qty);
                toast.success(`${qty}× ${product.shortName} in your cart`, { action: { label: "Checkout", onClick: () => (window.location.href = "/checkout") } });
              }}
            >
              <ShoppingBag className="size-5" />
            </Button>
            <Button size="lg" className="flex-1" loading={pending} onClick={() => reserve(product, qty)}>
              <Zap className="size-5" /> Reserve · {formatEgp(product.appPriceCents * qty)}
            </Button>
          </div>
        )}
        <p className="mt-2 text-center text-[11px] text-muted">
          {me ? (me.walletCents >= product.appPriceCents * qty ? "Paid from your wallet · held for you in the fridge" : "Pay at the fridge when you scan · held for you") : "Sign in once — then reserving is one tap"}
          {" · "}
          <Link href="/checkout" className="underline">
            delivery?
          </Link>
        </p>
      </div>
    </div>
  );
}
