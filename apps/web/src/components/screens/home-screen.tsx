"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Repeat2, Target, Zap } from "lucide-react";
import { CATEGORIES, FILTER_TAGS, TAG_LABELS } from "@/lib/catalog-meta";
import { greeting } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { useMe, useMenu, useRewards, useToday } from "@/lib/queries";
import type { Category, MachineDTO, MeDTO, ProductDTO, TodayDTO } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Mascot, Sticker, Squiggle } from "../brand/brand";
import { ProductArt } from "../brand/product-art";
import { AskBar } from "../app/ask-bar";
import { CartButton } from "../app/cart-button";
import { FridgePickerChip, useSelectedMachine } from "../app/fridge-picker";
import { HomeHeader } from "../app/header";
import { ActivePickupBanner } from "../app/pickup";
import { ProductCard } from "../app/product-card";
import { MacroSummary, PointsBar, StreakHeadline, StreakWeek } from "../app/progress";
import { useProductStock } from "../app/stock";
import { useQuickReserve } from "../app/use-quick-reserve";
import { Button, ButtonLink } from "../ui/button";
import { Card, Chip, SectionTitle, Skeleton } from "../ui/primitives";

type Props = {
  initialMachines: MachineDTO[];
  initialMenu: { products: ProductDTO[]; machine: MachineDTO | null };
};

export function HomeScreen({ initialMachines, initialMenu }: Props) {
  const { data: me } = useMe();
  const { selected } = useSelectedMachine(initialMachines);
  const machineId = selected?.id ?? initialMenu.machine?.id ?? null;
  const { data: menu, isFetching } = useMenu(machineId, machineId === initialMenu.machine?.id ? initialMenu : undefined);
  const { data: today } = useToday(Boolean(me));
  const products = menu?.products ?? [];

  const [category, setCategory] = useState<Category | "all">("all");
  const [tags, setTags] = useState<string[]>([]);
  const filtered = useMemo(
    () =>
      products.filter(
        (p) => (category === "all" || p.category === category) && tags.every((t) => p.tags.includes(t)),
      ),
    [products, category, tags],
  );
  const freshSaver = products.filter((p) => p.promo?.kind === "fresh_saver" && (p.stock?.available ?? 0) > 0);

  return (
    <div className="pb-6">
      <HomeHeader />
      <div className="mt-3 px-4">
        <FridgePickerChip initial={initialMachines} />
      </div>

      <div className="mt-4 grid gap-4 px-4">
        <ActivePickupBanner />
        {selected && !selected.isSelling && <MachineNotice machine={selected} />}
        {selected?.isSelling && selected.notice && (
          <p className="rounded-2xl bg-sun/30 px-4 py-3 text-sm font-medium text-forest-ink">📢 {selected.notice}</p>
        )}

        {me ? <ProgressCard me={me} today={today?.today} /> : <WelcomeCard />}
        <AskBar />
        {me && today && <SmartPicks me={me} today={today.today} usualSku={today.usual?.sku ?? null} products={products} />}
      </div>

      {freshSaver.length > 0 && (
        <section className="mt-6">
          <div className="px-4">
            <SectionTitle action={<span className="text-xs text-muted">Less waste, more savings</span>}>Fresh-saver deals</SectionTitle>
          </div>
          <div className="no-scrollbar flex gap-3 overflow-x-auto px-4 pb-1">
            {freshSaver.map((p) => (
              <ProductCard key={p.sku} product={p} className="w-40 shrink-0" />
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="px-4">
          <SectionTitle
            action={
              isFetching ? <span className="text-xs text-muted">Updating…</span> : <span className="text-xs text-muted">Live stock · {selected?.name ?? ""}</span>
            }
          >
            The menu
          </SectionTitle>
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            All
          </Chip>
          {CATEGORIES.map((c) => (
            <Chip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
              <span aria-hidden>{c.emoji}</span> {c.label}
            </Chip>
          ))}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-3">
          {FILTER_TAGS.map((t) => {
            const active = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTags((prev) => (active ? prev.filter((x) => x !== t) : [...prev, t]))}
                className={cn(
                  "h-8 shrink-0 rounded-full border px-3 text-xs font-semibold whitespace-nowrap transition",
                  active ? "border-orange bg-orange text-white" : "border-dashed border-forest/30 bg-transparent text-forest",
                )}
              >
                {TAG_LABELS[t]}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3 px-4">
          {products.length === 0
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-64" />)
            : filtered.map((p) => <ProductCard key={p.sku} product={p} />)}
        </div>
        {products.length > 0 && filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-muted">Nothing matches those filters here. Try another fridge or fewer filters.</p>
        )}
      </section>

      <CartButton products={products} />
    </div>
  );
}

function MachineNotice({ machine }: { machine: MachineDTO }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-paper p-3">
      <span className="text-2xl">{machine.isSeasonal ? "🏖️" : "⚠️"}</span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-semibold">{machine.isSeasonal ? `${machine.name} is closed for the season` : `${machine.name} isn't selling right now`}</p>
        <p className="text-muted">{machine.notice ?? (machine.salesLocked ? "Cooling check in progress — try another fridge." : "Pick another fridge nearby.")}</p>
      </div>
      <ButtonLink href="/fridges" size="sm" variant="secondary">
        Map
      </ButtonLink>
    </div>
  );
}

function WelcomeCard() {
  return (
    <Card className="relative overflow-hidden bg-forest p-5 text-white">
      <Mascot wave className="absolute -right-3 -bottom-4 h-36 w-32" />
      <Sticker tone="sun" className="absolute top-4 right-4 size-14" rotate={10}>
        Fresh daily
      </Sticker>
      <p className="font-hand text-xl text-sun">Always a good cal(l)</p>
      <h1 className="mt-1 max-w-[15rem] font-display text-[32px] leading-[1.05] tracking-wide uppercase">Good calories for life on the go</h1>
      <Squiggle className="mt-2 h-3 w-40" color="#f6c62f" />
      <p className="mt-3 max-w-[14rem] text-sm text-white/85">Reserve from the nearest Fridge, collect with a QR. Track macros, streaks and points.</p>
      <div className="mt-4 flex gap-2">
        <ButtonLink href="/signin" variant="accent" size="md">
          Sign in · 30 sec
        </ButtonLink>
        <ButtonLink href="/fridges" variant="ghost" size="md" className="text-white hover:bg-white/10">
          Find a fridge
        </ButtonLink>
      </div>
    </Card>
  );
}

function ProgressCard({ me, today }: { me: MeDTO; today?: TodayDTO }) {
  const { data: rewards } = useRewards();
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-sm text-muted">{greeting()},</p>
          <p className="font-display text-2xl leading-none tracking-wide text-forest-dark uppercase">{me.name.split(" ")[0]} 👋</p>
        </div>
        <Link href="/nutrition" className="text-xs font-semibold text-forest underline-offset-2 hover:underline">
          Today's progress →
        </Link>
      </div>
      {today ? <MacroSummary consumed={today.consumed} targets={today.targets} /> : <Skeleton className="h-28" />}
      <div className="my-4 h-px bg-line" />
      <StreakHeadline loyalty={me.loyalty} />
      <StreakWeek week={me.loyalty.streak.week} className="mt-2" />
      <div className="my-4 h-px bg-line" />
      <PointsBar loyalty={me.loyalty} rewards={rewards} />
    </Card>
  );
}

/** Goal-aware pick + "your usual", both reservable in one tap. */
function SmartPicks({ me, today, usualSku, products }: { me: MeDTO; today: TodayDTO; usualSku: string | null; products: ProductDTO[] }) {
  const proteinGap = Math.round(today.targets.proteinG - today.consumed.proteinG);
  const kcalLeft = today.targets.kcal - today.consumed.kcal;
  const allergens = new Set(me.profile.allergens);
  const safe = products.filter((p) => (p.stock?.available ?? 0) > 0 && !p.allergens.some((a) => allergens.has(a)));

  const pick =
    proteinGap > 10
      ? [...safe].filter((p) => p.nutrition.kcal <= Math.max(350, kcalLeft)).sort((a, b) => b.nutrition.proteinG / b.nutrition.kcal - a.nutrition.proteinG / a.nutrition.kcal)[0]
      : [...safe].filter((p) => p.nutrition.kcal <= Math.max(250, kcalLeft)).sort((a, b) => a.nutrition.kcal - b.nutrition.kcal)[0];
  const usual = usualSku ? products.find((p) => p.sku === usualSku) : undefined;

  if (!pick && !usual) return null;
  return (
    <div className="grid gap-3">
      {pick && (
        <PickRow
          product={pick}
          icon={<Target className="size-4" />}
          eyebrow={proteinGap > 10 ? `You're ${proteinGap} g short on protein today` : kcalLeft > 0 ? `${kcalLeft} kcal left today` : "Something light"}
          reason={proteinGap > 10 ? `${Math.round(pick.nutrition.proteinG)} g protein · ${pick.nutrition.kcal} kcal` : `${pick.nutrition.kcal} kcal`}
        />
      )}
      {usual && usual.sku !== pick?.sku && (
        <PickRow product={usual} icon={<Repeat2 className="size-4" />} eyebrow="Your usual" reason="Reserve again in one tap" />
      )}
    </div>
  );
}

function PickRow({ product, icon, eyebrow, reason }: { product: ProductDTO; icon: React.ReactNode; eyebrow: string; reason: string }) {
  const { reserve, pending } = useQuickReserve();
  const { available } = useProductStock(product);
  return (
    <Card className="flex items-center gap-3 p-3">
      <Link href={`/p/${product.slug}`} className="size-16 shrink-0 rounded-2xl bg-cream">
        <ProductArt category={product.category} layers={product.art.layers} accent={product.art.accent} label={product.shortName} className="size-full" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-[11px] font-bold tracking-wide text-orange uppercase">
          {icon} {eyebrow}
        </p>
        <p className="truncate font-semibold">{product.name}</p>
        <p className="flex items-center gap-2 text-xs text-muted">
          {reason}
          {available !== null && available <= 3 && <span className="font-semibold text-tomato">· {available} left</span>}
        </p>
      </div>
      <Button size="sm" onClick={() => reserve(product)} loading={pending} className="shrink-0">
        <Zap className="size-4" /> {formatEgp(product.appPriceCents)}
      </Button>
    </Card>
  );
}
