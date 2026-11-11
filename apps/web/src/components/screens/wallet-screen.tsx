"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { relativeTime } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { keys, useMe, useWallet } from "@/lib/queries";
import { PageHeader } from "../app/header";
import { Button, ButtonLink } from "../ui/button";
import { Card, EmptyState, Input, SectionTitle, Skeleton } from "../ui/primitives";

const AMOUNTS = [10000, 20000, 50000, 100000];
const METHODS = [
  { id: "card", label: "Card", hint: "Visa · Mastercard · Meeza" },
  { id: "instapay", label: "InstaPay", hint: "Instant bank transfer" },
  { id: "fawry", label: "Fawry", hint: "Pay at any Fawry outlet" },
  { id: "mobile_wallet", label: "Mobile wallet", hint: "Vodafone Cash · Orange · Etisalat" },
] as const;

export function WalletScreen() {
  const { data: me, isLoading } = useMe();
  const { data: wallet } = useWallet(Boolean(me));
  const qc = useQueryClient();
  const [amount, setAmount] = useState(20000);
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("card");
  const [card, setCard] = useState({ number: "4242 4242 4242 4242", expiry: "12/29", cvc: "123" });
  const [busy, setBusy] = useState(false);

  if (!isLoading && !me) {
    return (
      <div>
        <PageHeader title="Wallet" />
        <EmptyState title="Sign in to use the wallet" body="Top up once, then every order is a single tap." action={<ButtonLink href="/signin?next=/wallet">Sign in</ButtonLink>} />
      </div>
    );
  }

  async function topUp() {
    setBusy(true);
    try {
      await api("/api/wallet/topup", { method: "POST", json: { amountCents: amount, method, ...(method === "card" ? { card } : {}) } });
      toast.success(`${formatEgp(amount)} added to your wallet`);
      void qc.invalidateQueries({ queryKey: keys.wallet });
      void qc.invalidateQueries({ queryKey: keys.me });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Top-up failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title="Wallet" />
      <div className="grid gap-5 px-4">
        <Card className="bg-forest-ink p-5 text-white">
          <p className="text-sm text-white/70">Balance</p>
          <p className="font-display text-5xl tracking-wide">{formatEgp(wallet?.walletCents ?? me?.walletCents ?? 0)}</p>
          <p className="mt-2 text-xs text-white/70">Orders charge your wallet automatically. Refunds and rewards land here instantly.</p>
        </Card>

        <Card className="grid gap-4 p-4">
          <SectionTitle className="mb-0">Top up</SectionTitle>
          <div className="grid grid-cols-4 gap-2">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAmount(a)}
                className={cn("h-11 rounded-2xl border text-sm font-bold", amount === a ? "border-forest bg-forest text-white" : "border-line bg-paper")}
              >
                {a / 100}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMethod(m.id)}
                className={cn("rounded-2xl border p-3 text-left", method === m.id ? "border-forest bg-forest/5 ring-2 ring-forest/15" : "border-line bg-paper")}
              >
                <span className="block text-sm font-semibold">{m.label}</span>
                <span className="block text-[11px] text-muted">{m.hint}</span>
              </button>
            ))}
          </div>
          {method === "card" && (
            <div className="grid grid-cols-6 gap-2">
              <Input className="col-span-6" value={card.number} onChange={(e) => setCard({ ...card, number: e.target.value })} aria-label="Card number" inputMode="numeric" />
              <Input className="col-span-3" value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} aria-label="Expiry" />
              <Input className="col-span-3" value={card.cvc} onChange={(e) => setCard({ ...card, cvc: e.target.value })} aria-label="CVC" inputMode="numeric" />
              <p className="col-span-6 text-[11px] text-muted">Sandbox: 4242… approves, 4000 0000 0000 0002 declines.</p>
            </div>
          )}
          <Button size="lg" loading={busy} onClick={topUp}>
            Add {formatEgp(amount)}
          </Button>
        </Card>

        <section>
          <SectionTitle>Activity</SectionTitle>
          {!wallet ? (
            <Skeleton className="h-40" />
          ) : (
            <ul className="divide-y divide-line rounded-[22px] border border-line bg-paper">
              {wallet.transactions.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="grid size-9 place-items-center rounded-full bg-cream text-base">
                    {{ topup: "⬆️", payment: "🥗", refund: "↩️", reward: "🎁", adjustment: "💚" }[t.type]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{t.description}</p>
                    <p className="text-[11px] text-muted">{relativeTime(t.createdAt)}</p>
                  </div>
                  <span className={cn("font-semibold tabular-nums", t.amountCents > 0 ? "text-forest" : "text-ink")}>
                    {t.amountCents > 0 ? "+" : "–"}
                    {formatEgp(Math.abs(t.amountCents))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
