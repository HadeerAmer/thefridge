"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { relativeTime } from "@/lib/dates";
import { formatEgp } from "@/lib/money";
import { useMe, useOrders } from "@/lib/queries";
import { Mascot } from "../brand/brand";
import { PageHeader } from "../app/header";
import { STATUS_LABEL, isActiveOrder, statusTone } from "../app/order-status";
import { ButtonLink } from "../ui/button";
import { Badge, Card, EmptyState, SectionTitle, Skeleton } from "../ui/primitives";

export function OrdersScreen() {
  const { data: me, isLoading: meLoading } = useMe();
  const { data: orders, isLoading } = useOrders(Boolean(me));

  if (!meLoading && !me) {
    return (
      <div>
        <PageHeader title="Orders" back={false} />
        <EmptyState
          art={<Mascot className="h-28 w-24" />}
          title="Sign in to see your orders"
          body="Your reservations, QR codes and deliveries live here."
          action={<ButtonLink href="/signin?next=/orders">Sign in</ButtonLink>}
        />
      </div>
    );
  }

  const active = orders?.filter(isActiveOrder) ?? [];
  const past = orders?.filter((o) => !isActiveOrder(o)) ?? [];

  return (
    <div>
      <PageHeader title="Orders" back={false} />
      <div className="grid gap-6 px-4">
        {isLoading && <Skeleton className="h-24" />}
        {active.length > 0 && (
          <section>
            <SectionTitle>Active</SectionTitle>
            <div className="grid gap-2">{active.map((o) => <OrderRow key={o.id} order={o} />)}</div>
          </section>
        )}
        <section>
          <SectionTitle>History</SectionTitle>
          {past.length === 0 && !isLoading ? (
            <EmptyState title="No orders yet" body="Reserve something fresh and it shows up here." action={<ButtonLink href="/">Browse the menu</ButtonLink>} />
          ) : (
            <div className="grid gap-2">{past.map((o) => <OrderRow key={o.id} order={o} />)}</div>
          )}
        </section>
      </div>
    </div>
  );
}

function OrderRow({ order }: { order: import("@/lib/types").OrderDTO }) {
  return (
    <Link href={`/orders/${order.id}`}>
      <Card className="flex items-center gap-3 p-3.5">
        <span className="grid size-11 place-items-center rounded-2xl bg-cream text-xl">{order.fulfillment === "delivery" ? "🛵" : "🧊"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{order.number}</span>
            <Badge tone={statusTone(order.status)}>{STATUS_LABEL[order.status]}</Badge>
          </div>
          <p className="truncate text-xs text-muted">{order.items.map((i) => `${i.qty}× ${i.name}`).join(", ")}</p>
          <p className="text-[11px] text-muted">
            {order.machine.name} · {relativeTime(order.createdAt)}
            {order.pointsEarned > 0 && ` · +${order.pointsEarned} pts`}
          </p>
        </div>
        <span className="font-display text-lg text-forest-dark">{formatEgp(order.totals.totalCents)}</span>
        <ChevronRight className="size-4 text-muted" />
      </Card>
    </Link>
  );
}
