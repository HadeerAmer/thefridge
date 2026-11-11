"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Copy, Gift, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { formatEgp } from "@/lib/money";
import { keys, useMe, useRequests, useRewards } from "@/lib/queries";
import { Mascot, Sticker } from "../brand/brand";
import { PageHeader } from "../app/header";
import { StreakHeadline, StreakWeek } from "../app/progress";
import { Button, ButtonLink } from "../ui/button";
import { Card, EmptyState, Input, SectionTitle, Skeleton } from "../ui/primitives";

export function RewardsScreen() {
  const { data: me, isLoading } = useMe();
  const { data: rewards } = useRewards();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  if (!isLoading && !me) {
    return (
      <div>
        <PageHeader title="Rewards" />
        <EmptyState
          art={<Mascot className="h-28 w-24" />}
          title="Earn on every meal"
          body="1 point per pound, streak bonuses, and every 10th meal on us. Sign in to start collecting."
          action={<ButtonLink href="/signin?next=/rewards">Sign in</ButtonLink>}
        />
      </div>
    );
  }
  if (!me) return <Skeleton className="m-4 h-64" />;
  const { loyalty } = me;

  async function redeem(id: string) {
    setBusy(id);
    try {
      const res = await api<{ message: string }>(`/api/rewards/${id}/redeem`, { method: "POST" });
      toast.success("Redeemed!", { description: res.message });
      void qc.invalidateQueries({ queryKey: keys.me });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't redeem");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title="Rewards" />
      <div className="grid gap-5 px-4">
        <Card className="relative overflow-hidden bg-forest p-5 text-white">
          <Sticker tone="sun" className="absolute top-4 right-4 size-16" rotate={10}>
            {loyalty.tier.name}
          </Sticker>
          <p className="text-sm text-white/75">Your points</p>
          <p className="font-display text-5xl tracking-wide">{loyalty.points.toLocaleString()}</p>
          <p className="mt-1 text-sm text-white/80">
            {loyalty.nextTier
              ? `${loyalty.pointsToNext.toLocaleString()} lifetime points to ${loyalty.nextTier.name} (earn ×${loyalty.tier.multiplier === 1 ? "1.25" : "1.5"})`
              : `Top tier — you earn ×${loyalty.tier.multiplier} points`}
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/20">
            <div className="h-full rounded-full bg-sun" style={{ width: `${loyalty.tierProgress * 100}%` }} />
          </div>
        </Card>

        <Card className="p-4">
          <StreakHeadline loyalty={loyalty} />
          <StreakWeek week={loyalty.streak.week} className="mt-3" />
          <p className="mt-3 text-xs text-muted">
            Bonuses at 3, 7, 14 and 30 days. Best streak: {loyalty.streak.best} days. Fridays and Saturdays never break it.
          </p>
        </Card>

        {loyalty.stamps.size > 0 && (
          <Card className="p-4">
            <SectionTitle className="mb-2">Stamp card</SectionTitle>
            <p className="mb-3 text-sm text-muted">Every {loyalty.stamps.size}th meal is on us — credited straight to your wallet.</p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: loyalty.stamps.size }, (_, i) => {
                const filled = i < loyalty.stamps.count;
                const last = i === loyalty.stamps.size - 1;
                return (
                  <span
                    key={i}
                    className={cn(
                      "grid aspect-square place-items-center rounded-full border-2 text-lg",
                      filled ? "border-forest bg-forest text-white" : last ? "border-dashed border-orange text-orange" : "border-dashed border-line text-muted",
                    )}
                  >
                    {filled ? "🥗" : last ? <Gift className="size-5" /> : i + 1}
                  </span>
                );
              })}
            </div>
          </Card>
        )}

        <section>
          <SectionTitle>Spend your points</SectionTitle>
          <div className="grid gap-2">
            {(rewards ?? []).map((r) => {
              const affordable = loyalty.points >= r.costPoints;
              return (
                <Card key={r.id} className="flex items-center gap-3 p-3.5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cream text-2xl">{r.kind === "merch" ? "👜" : "💚"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-muted">{r.description}</p>
                    <p className="mt-0.5 text-xs font-bold text-orange">{r.costPoints.toLocaleString()} pts</p>
                  </div>
                  <Button size="sm" variant={affordable ? "primary" : "secondary"} disabled={!affordable} loading={busy === r.id} onClick={() => redeem(r.id)}>
                    {affordable ? "Redeem" : `${(r.costPoints - loyalty.points).toLocaleString()} more`}
                  </Button>
                </Card>
              );
            })}
          </div>
        </section>

        <Card className="p-4">
          <SectionTitle className="mb-2">Bring a friend</SectionTitle>
          <p className="text-sm text-muted">Share your code — when a friend collects their first meal you both get {formatEgp(5000)} in your wallets.</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="flex-1 rounded-2xl border-2 border-dashed border-forest/40 bg-cream py-3 text-center font-display text-2xl tracking-[0.15em] text-forest-dark">
              {me.referralCode}
            </span>
            <Button
              variant="secondary"
              aria-label="Copy referral code"
              onClick={() => {
                void navigator.clipboard?.writeText(me.referralCode);
                toast.success("Copied");
              }}
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </Card>

        <ProductRequests />
      </div>
    </div>
  );
}

/** Members request and vote on what the fridges stock next. */
function ProductRequests() {
  const { data: requests } = useRequests();
  const qc = useQueryClient();
  const [name, setName] = useState("");

  async function vote(id: string) {
    try {
      await api(`/api/requests/${id}/vote`, { method: "POST" });
      void qc.invalidateQueries({ queryKey: keys.requests });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't vote");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return;
    try {
      await api("/api/requests", { method: "POST", json: { name } });
      setName("");
      toast.success("Request added — thanks!");
      void qc.invalidateQueries({ queryKey: keys.requests });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't add");
    }
  }

  return (
    <Card className="p-4">
      <SectionTitle className="mb-2">What should we stock next?</SectionTitle>
      <p className="mb-3 text-sm text-muted">Vote — the top requests go into the next restock.</p>
      <ul className="grid gap-2">
        {(requests ?? []).map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2">
            <span className="flex-1 text-sm font-medium">
              {r.name}
              {r.note && <span className="block text-xs text-muted">{r.note}</span>}
            </span>
            <button
              type="button"
              onClick={() => vote(r.id)}
              disabled={r.voted}
              className={cn("flex items-center gap-1 rounded-full px-3 py-1 text-sm font-bold", r.voted ? "bg-forest text-white" : "bg-paper text-forest")}
            >
              <ThumbsUp className="size-3.5" /> {r.votes}
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Overnight oats" />
        <Button type="submit">Add</Button>
      </form>
    </Card>
  );
}
