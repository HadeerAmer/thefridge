"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bike, CreditCard, LocateFixed, MapPin, Minus, Plus, Store, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { useConfig } from "@/lib/config";
import { DEFAULT_LOCATION } from "@/lib/geo";
import { formatEgp } from "@/lib/money";
import { newIdempotencyKey, useCreateOrder, useMe, useMenu } from "@/lib/queries";
import { useCart } from "@/stores/cart";
import { useLocationStore } from "@/stores/location";
import { ProductArt } from "../brand/product-art";
import { Mascot } from "../brand/brand";
import { useSelectedMachine } from "../app/fridge-picker";
import { PageHeader } from "../app/header";
import { Button, ButtonLink } from "../ui/button";
import { Card, EmptyState, Field, Input, SectionTitle, Skeleton } from "../ui/primitives";

type Fulfillment = "pickup" | "delivery";
type PayMethod = "wallet" | "card" | "pay_at_fridge" | "cash";

type Quote = {
  machine: { id: string; name: string; isSelling: boolean };
  lines: { sku: string; name: string; qty: number; unitCents: number; listCents: number; label: string | null; available: number }[];
  listTotalCents: number;
  comboDiscountCents: number;
  studentDiscountCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  promos: string[];
  km: number;
  holdMinutes: number;
  problems: string[];
};

type DeliveryQuote = { machineId: string; machineName: string; km: number; feeCents: number; etaMinutes: number; missing: string[] } | null;

export function CheckoutScreen() {
  const router = useRouter();
  const { data: me } = useMe();
  const { data: config } = useConfig();
  const { lines, setQty, add, clear } = useCart();
  const { selected } = useSelectedMachine();
  const { coords, locate, status } = useLocationStore();
  const { data: menu } = useMenu(selected?.id ?? null);
  const createOrder = useCreateOrder();

  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [method, setMethod] = useState<PayMethod>("wallet");
  const [card, setCard] = useState({ number: "4242 4242 4242 4242", expiry: "12/29", cvc: "123" });
  const [address, setAddress] = useState({ text: "", lat: 0, lng: 0 });
  const [idempotencyKey] = useState(newIdempotencyKey);

  const products = useMemo(() => new Map((menu?.products ?? []).map((p) => [p.sku, p])), [menu]);
  const items = lines.filter((l) => products.has(l.sku));

  // Default delivery address: first saved address, else current location.
  useEffect(() => {
    if (address.lat || !me) return;
    const saved = me.addresses[0];
    if (saved) setAddress({ text: saved.line1, lat: saved.lat, lng: saved.lng });
    else if (coords) setAddress({ text: "My current location", ...coords });
  }, [me, coords, address.lat]);

  // Delivery comes from the nearest fridge that has everything.
  const { data: deliveryQuote } = useQuery({
    queryKey: ["delivery-quote", items, address.lat, address.lng],
    queryFn: () => api<{ quote: DeliveryQuote }>("/api/delivery/quote", { method: "POST", json: { items, lat: address.lat, lng: address.lng } }).then((r) => r.quote),
    enabled: fulfillment === "delivery" && items.length > 0 && address.lat !== 0,
  });
  const sourceMachineId = fulfillment === "delivery" ? (deliveryQuote?.machineId ?? null) : (selected?.id ?? null);

  const { data: quote, isFetching: quoting } = useQuery({
    queryKey: ["quote", sourceMachineId, items, fulfillment, address.lat, address.lng],
    queryFn: () =>
      api<{ quote: Quote }>("/api/orders/quote", {
        method: "POST",
        json: {
          machineId: sourceMachineId,
          items,
          fulfillment,
          ...(fulfillment === "delivery" ? { delivery: { lat: address.lat, lng: address.lng } } : {}),
        },
      }).then((r) => r.quote),
    enabled: Boolean(sourceMachineId) && items.length > 0,
    placeholderData: (prev) => prev,
  });

  // Keep the payment method valid for the fulfillment + wallet balance.
  useEffect(() => {
    if (fulfillment === "pickup" && method === "cash") setMethod("pay_at_fridge");
    if (fulfillment === "delivery" && method === "pay_at_fridge") setMethod("wallet");
  }, [fulfillment, method]);
  const walletShort = me && quote ? me.walletCents < quote.totalCents : false;
  useEffect(() => {
    if (walletShort && method === "wallet") setMethod(fulfillment === "pickup" ? "pay_at_fridge" : "card");
  }, [walletShort, method, fulfillment]);

  const hasMain = items.some((l) => ["salad", "wrap", "sandwich", "bowl"].includes(products.get(l.sku)?.category ?? ""));
  const hasDrink = items.some((l) => products.get(l.sku)?.category === "drink");
  const comboDrink = hasMain && !hasDrink && (config?.pricing.comboDrinkDiscountCents ?? 0) > 0
    ? (menu?.products ?? []).filter((p) => p.category === "drink" && (p.stock?.available ?? 0) > 0).sort((a, b) => a.appPriceCents - b.appPriceCents)[0]
    : undefined;

  async function placeOrder() {
    if (!me) {
      router.push("/signin?next=/checkout");
      return;
    }
    if (!sourceMachineId) return;
    try {
      const order = await createOrder.mutateAsync({
        machineId: sourceMachineId,
        items,
        fulfillment,
        paymentMethod: method,
        ...(method === "card" ? { card } : {}),
        ...(fulfillment === "delivery" ? { delivery: { address: address.text || "Pinned location", lat: address.lat, lng: address.lng } } : {}),
        idempotencyKey,
      });
      clear();
      toast.success(fulfillment === "pickup" ? `Reserved! Held for ${quote?.holdMinutes ?? 15} min` : "Order placed — we're on it");
      router.replace(`/orders/${order.id}`);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Something went wrong");
    }
  }

  if (lines.length === 0) {
    return (
      <div>
        <PageHeader title="Your cart" />
        <EmptyState
          art={<Mascot className="h-28 w-24" />}
          title="Your cart is empty"
          body="Add something fresh from the menu — or reserve a single item in one tap from its page."
          action={<ButtonLink href="/">Browse the menu</ButtonLink>}
        />
      </div>
    );
  }

  const placeDisabled = !quote || quote.problems.length > 0 || createOrder.isPending || (fulfillment === "delivery" && !deliveryQuote);

  return (
    <div className="pb-44">
      <PageHeader title="Checkout" />
      <div className="grid gap-5 px-4">
        {/* Fulfillment */}
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-cream-deep p-1">
          {(
            [
              ["pickup", "Pick up", Store],
              ["delivery", "Delivery", Bike],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              disabled={value === "delivery" && config?.delivery.enabled === false}
              onClick={() => setFulfillment(value)}
              className={cn(
                "flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition disabled:opacity-40",
                fulfillment === value ? "bg-paper text-forest shadow-card" : "text-muted",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        {fulfillment === "pickup" ? (
          <Card className="flex items-center gap-3 p-4">
            <MapPin className="size-5 text-forest" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Collect at</p>
              <p className="truncate font-semibold">{selected?.name ?? "—"}</p>
              <p className="text-xs text-muted">Held for {quote?.holdMinutes ?? config?.holdMinutes ?? 15} min · scan your QR at the fridge</p>
            </div>
            <Link href="/fridges" className="text-sm font-semibold text-forest">
              Change
            </Link>
          </Card>
        ) : (
          <Card className="grid gap-3 p-4">
            <SectionTitle className="mb-0">Deliver to</SectionTitle>
            {me?.addresses.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAddress({ text: a.line1, lat: a.lat, lng: a.lng })}
                className={cn("rounded-2xl border p-3 text-left text-sm", address.lat === a.lat && address.lng === a.lng ? "border-forest bg-forest/5" : "border-line")}
              >
                <span className="font-semibold">{a.label}</span> · <span className="text-muted">{a.line1}</span>
              </button>
            ))}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (coords) setAddress({ text: "My current location", ...coords });
                else {
                  locate();
                  setAddress({ text: "Sheikh Zayed (approximate)", ...DEFAULT_LOCATION });
                }
              }}
            >
              <LocateFixed className="size-4" /> {status === "locating" ? "Finding you…" : "Use my current location"}
            </Button>
            <Field label="Address details">
              <Input value={address.text} onChange={(e) => setAddress((a) => ({ ...a, text: e.target.value }))} placeholder="Building, floor, landmark" />
            </Field>
            {deliveryQuote ? (
              <p className="rounded-2xl bg-cream px-3 py-2 text-sm">
                🛵 From <strong>{deliveryQuote.machineName}</strong> · {deliveryQuote.km} km · about {deliveryQuote.etaMinutes} min
                {deliveryQuote.missing.length > 0 && <span className="block text-tomato">Not in stock there: {deliveryQuote.missing.join(", ")}</span>}
              </p>
            ) : (
              address.lat !== 0 && <p className="text-sm text-tomato">No fridge within delivery range has these items.</p>
            )}
          </Card>
        )}

        {/* Items */}
        <section>
          <SectionTitle action={<button type="button" onClick={clear} className="text-xs text-muted underline">Clear</button>}>Your order</SectionTitle>
          <ul className="grid gap-2">
            {items.map((line) => {
              const p = products.get(line.sku)!;
              const q = quote?.lines.find((l) => l.sku === line.sku);
              return (
                <li key={line.sku} className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-2.5">
                  <div className="size-14 shrink-0 rounded-xl bg-cream">
                    <ProductArt category={p.category} layers={p.art.layers} accent={p.art.accent} label={p.shortName} className="size-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.name}</p>
                    <p className="text-xs text-muted">
                      {formatEgp(q?.unitCents ?? p.appPriceCents)}
                      {q?.label && <span className="ml-1 text-forest">· {q.label}</span>}
                      {q && q.available < line.qty && <span className="ml-1 font-semibold text-tomato">· {q.available} left</span>}
                    </p>
                  </div>
                  <div className="flex items-center rounded-xl bg-cream">
                    <button type="button" aria-label="Less" className="grid size-9 place-items-center" onClick={() => setQty(line.sku, line.qty - 1)}>
                      {line.qty === 1 ? <Trash2 className="size-4 text-tomato" /> : <Minus className="size-4" />}
                    </button>
                    <span className="w-5 text-center text-sm font-semibold">{line.qty}</span>
                    <button type="button" aria-label="More" className="grid size-9 place-items-center" onClick={() => setQty(line.sku, line.qty + 1)}>
                      <Plus className="size-4" />
                    </button>
                  </div>
                </li>
              );
            })}
            {lines.length > items.length && (
              <li className="text-xs text-muted">{lines.length - items.length} item(s) aren't on this fridge's menu and were left out.</li>
            )}
          </ul>
          {comboDrink && (
            <button
              type="button"
              onClick={() => add(comboDrink.sku)}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-orange/50 bg-orange/5 p-3 text-left"
            >
              <span className="text-2xl">🍹</span>
              <span className="flex-1 text-sm">
                <strong>Make it a combo:</strong> add {comboDrink.name} and save {formatEgp(config!.pricing.comboDrinkDiscountCents)}
              </span>
              <Plus className="size-5 text-orange" />
            </button>
          )}
        </section>

        {/* Payment */}
        <section>
          <SectionTitle>Pay with</SectionTitle>
          <div className="grid gap-2">
            <PayOption active={method === "wallet"} onClick={() => setMethod("wallet")} disabled={walletShort} icon={<Wallet className="size-5" />}
              title="The Fridge wallet" subtitle={me ? `${formatEgp(me.walletCents)} available${walletShort ? " — top up to use" : " · one tap, no card needed"}` : "Sign in to use your wallet"}
              extra={walletShort ? <Link href="/wallet" className="text-sm font-semibold text-forest">Top up</Link> : null} />
            <PayOption active={method === "card"} onClick={() => setMethod("card")} icon={<CreditCard className="size-5" />} title="Card" subtitle="Visa / Mastercard / Meeza (sandbox)" />
            {method === "card" && (
              <Card className="grid grid-cols-6 gap-2 p-3">
                <Input className="col-span-6" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} inputMode="numeric" aria-label="Card number" />
                <Input className="col-span-3" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} aria-label="Expiry MM/YY" />
                <Input className="col-span-3" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} inputMode="numeric" aria-label="CVC" />
                <p className="col-span-6 text-[11px] text-muted">Test cards: 4242… approves · 4000 0000 0000 0002 declines</p>
              </Card>
            )}
            {fulfillment === "pickup" ? (
              <PayOption active={method === "pay_at_fridge"} onClick={() => setMethod("pay_at_fridge")} icon={<Store className="size-5" />} title="Pay at the fridge" subtitle="Tap your card on the machine when you scan" />
            ) : (
              <PayOption active={method === "cash"} onClick={() => setMethod("cash")} icon={<span className="text-lg">💵</span>} title="Cash on delivery" subtitle="Pay the courier" />
            )}
          </div>
        </section>

        {/* Totals */}
        <Card className="grid gap-1.5 p-4 text-sm">
          {!quote ? (
            <Skeleton className="h-20" />
          ) : (
            <>
              <Row label="Menu price" value={formatEgp(quote.listTotalCents)} />
              {quote.discountCents > 0 && <Row label={`You save${quote.promos.length ? ` (${quote.promos.join(", ")})` : ""}`} value={`– ${formatEgp(quote.discountCents)}`} green />}
              {fulfillment === "delivery" && <Row label={`Delivery (${quote.km} km)`} value={quote.deliveryFeeCents === 0 ? "Free" : formatEgp(quote.deliveryFeeCents)} />}
              <div className="my-1 h-px bg-line" />
              <div className="flex items-baseline justify-between">
                <span className="font-semibold">Total</span>
                <span className={cn("font-display text-2xl text-forest-dark", quoting && "opacity-60")}>{formatEgp(quote.totalCents)}</span>
              </div>
              <p className="text-xs text-muted">≈ {Math.floor((quote.totalCents / 100) * (config?.loyalty.pointsPerEgp ?? 1))} points when you collect</p>
              {quote.problems.map((p) => (
                <p key={p} className="rounded-xl bg-[#fde3da] px-3 py-2 text-xs font-semibold text-[#9c2b10]">
                  {p}
                </p>
              ))}
            </>
          )}
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-20 mx-auto max-w-[480px] border-t border-line bg-paper/95 px-4 py-3 backdrop-blur">
        <Button size="lg" className="w-full" disabled={placeDisabled && Boolean(me)} loading={createOrder.isPending} onClick={placeOrder}>
          {!me
            ? "Sign in to continue"
            : fulfillment === "pickup"
              ? `Reserve for ${quote?.holdMinutes ?? 15} min · ${quote ? formatEgp(quote.totalCents) : "…"}`
              : `Place delivery order · ${quote ? formatEgp(quote.totalCents) : "…"}`}
        </Button>
      </div>
    </div>
  );
}

function PayOption({
  active,
  onClick,
  icon,
  title,
  subtitle,
  disabled,
  extra,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  disabled?: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border bg-paper p-3 transition", active ? "border-forest ring-2 ring-forest/15" : "border-line", disabled && "opacity-60")}>
      <button type="button" disabled={disabled} onClick={onClick} className="flex flex-1 items-center gap-3 text-left">
        <span className={cn("grid size-10 place-items-center rounded-xl", active ? "bg-forest text-white" : "bg-cream text-forest")}>{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        </span>
        <span className={cn("size-5 rounded-full border-2", active ? "border-forest bg-forest shadow-[inset_0_0_0_3px_#fffdf8]" : "border-line")} />
      </button>
      {extra}
    </div>
  );
}

function Row({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={cn("tabular-nums", green && "font-semibold text-forest")}>{value}</span>
    </div>
  );
}
