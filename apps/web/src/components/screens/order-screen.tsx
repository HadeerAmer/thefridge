"use client";

import { useQueryClient } from "@tanstack/react-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { Check, Navigation, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortTime } from "@/lib/dates";
import { interpolate } from "@/lib/geo";
import { formatEgp } from "@/lib/money";
import { keys, useOrder } from "@/lib/queries";
import type { OrderDTO } from "@/lib/types";
import { PageHeader } from "../app/header";
import { PAYMENT_LABEL, STATUS_LABEL, statusTone } from "../app/order-status";
import { HoldCountdown, PickupQr, formatCountdown, useNow } from "../app/pickup";
import { Button } from "../ui/button";
import { Badge, Card, SectionTitle, Skeleton } from "../ui/primitives";
import { Sheet } from "../ui/sheet";

const MapView = dynamic(() => import("../app/map-view"), { ssr: false, loading: () => <Skeleton className="h-full rounded-none" /> });

export function OrderScreen({ id, demoMode }: { id: string; demoMode: boolean }) {
  const { data: order, isLoading } = useOrder(id);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);

  if (isLoading || !order) {
    return (
      <div>
        <PageHeader title="Order" />
        <div className="grid gap-3 px-4">
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  async function cancel() {
    if (!confirm("Cancel this order? Paid orders are refunded to your wallet instantly.")) return;
    setBusy("cancel");
    try {
      const res = await api<{ order: OrderDTO }>(`/api/orders/${id}/cancel`, { method: "POST" });
      qc.setQueryData(keys.order(id), res.order);
      void qc.invalidateQueries({ queryKey: keys.me });
      toast.success(res.order.payment.status === "refunded" ? "Cancelled — refunded to your wallet" : "Cancelled");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't cancel");
    } finally {
      setBusy(null);
    }
  }

  async function simulateScan() {
    setBusy("scan");
    try {
      const res = await api<{ status: string; message: string }>("/api/demo/scan", { method: "POST", json: { orderId: id } });
      if (res.status === "awaiting_payment") toast("The fridge is asking for payment", { description: "Tap card on the simulator screen (localhost:4000)." });
      else if (res.status === "rejected") toast.error(res.message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Scan failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="pb-10">
      <PageHeader title={`Order ${order.number}`} />
      <div className="grid gap-4 px-4">
        {order.status === "reserved" && order.pickupCode && (
          <Card className="flex flex-col items-center p-5 text-center">
            <Badge tone="sun">Held for you at {order.machine.name}</Badge>
            <div className="mt-4">
              <PickupQr code={order.pickupCode} size={232} />
            </div>
            <p className="mt-3 font-display text-3xl tracking-[0.12em] text-forest-dark">{order.pickupCode}</p>
            <p className="text-xs text-muted">Hold this QR to the fridge's scanner — or type the code on its screen.</p>
            <div className="mt-4 flex items-center gap-3">
              <HoldCountdown order={order} size={84} />
              <div className="text-left text-sm">
                <p className="font-semibold">Time left to collect</p>
                <p className="text-muted">
                  {order.payment.status === "paid" ? "Already paid — it drops right away." : `Pay ${formatEgp(order.totals.totalCents)} on the machine.`}
                </p>
              </div>
            </div>
            <div className="mt-5 grid w-full gap-2">
              {demoMode && (
                <Button size="lg" variant="accent" loading={busy === "scan"} onClick={simulateScan}>
                  <ScanLine className="size-5" /> I'm at the fridge — simulate the scan
                </Button>
              )}
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${order.machine.lat},${order.machine.lng}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-cream font-semibold text-forest"
              >
                <Navigation className="size-4" /> Directions to the fridge
              </a>
              <Button variant="ghost" loading={busy === "cancel"} onClick={cancel}>
                Cancel reservation
              </Button>
            </div>
          </Card>
        )}

        {order.fulfillment === "delivery" && <DeliveryTracker order={order} onCancel={order.canCancel ? cancel : undefined} />}

        {["completed", "delivered"].includes(order.status) && (
          <Card className="flex items-center gap-3 bg-forest p-4 text-white">
            <span className="grid size-12 place-items-center rounded-full bg-sun text-forest-ink">
              <Check className="size-6" />
            </span>
            <div className="flex-1">
              <p className="font-display text-2xl tracking-wide uppercase">{order.status === "completed" ? "Collected" : "Delivered"} — enjoy!</p>
              <p className="text-sm text-white/80">
                +{order.pointsEarned} points · macros added to today's log
              </p>
            </div>
          </Card>
        )}

        {["expired", "cancelled", "failed"].includes(order.status) && (
          <Card className="p-4">
            <Badge tone={statusTone(order.status)}>{STATUS_LABEL[order.status]}</Badge>
            <p className="mt-2 text-sm text-muted">{order.failureReason ?? "This order is closed."}</p>
            {order.payment.status === "refunded" && <p className="mt-1 text-sm font-semibold text-forest">{formatEgp(order.totals.totalCents)} was refunded to your wallet.</p>}
          </Card>
        )}

        <Card className="p-4">
          <SectionTitle>Items</SectionTitle>
          <ul className="grid gap-2 text-sm">
            {order.items.map((i) => (
              <li key={i.sku} className="flex justify-between gap-3">
                <span>
                  {i.qty}× {i.name}
                  {i.discountLabel && <span className="ml-1 text-xs text-forest">· {i.discountLabel}</span>}
                </span>
                <span className="tabular-nums">{formatEgp(i.unitPriceCents * i.qty)}</span>
              </li>
            ))}
          </ul>
          <div className="my-3 h-px bg-line" />
          <div className="grid gap-1 text-sm">
            {order.totals.discountCents > 0 && (
              <p className="flex justify-between text-forest">
                <span>You saved</span>
                <span>– {formatEgp(order.totals.discountCents)}</span>
              </p>
            )}
            {order.totals.deliveryFeeCents > 0 && (
              <p className="flex justify-between">
                <span className="text-muted">Delivery</span>
                <span>{formatEgp(order.totals.deliveryFeeCents)}</span>
              </p>
            )}
            <p className="flex justify-between font-semibold">
              <span>Total · {PAYMENT_LABEL[order.payment.method]}</span>
              <span>{formatEgp(order.totals.totalCents)}</span>
            </p>
            <p className="text-xs text-muted">
              {order.payment.status === "paid" ? "Paid" : order.payment.status === "refunded" ? "Refunded" : "Not paid yet"} · {order.machine.name}
            </p>
          </div>
        </Card>

        {order.canReportIssue && <ReportIssue orderId={order.id} />}
        <Link href="/orders" className="text-center text-sm font-semibold text-forest">
          All orders
        </Link>
      </div>
    </div>
  );
}

const STEPS = [
  { status: "placed", label: "Order placed", key: "placedAt" },
  { status: "assigned", label: "Driver assigned", key: "assignedAt" },
  { status: "picked_up", label: "Collected from the fridge", key: "pickedUpAt" },
  { status: "on_the_way", label: "On the way", key: "onTheWayAt" },
  { status: "delivered", label: "Delivered", key: "deliveredAt" },
] as const;

function DeliveryTracker({ order, onCancel }: { order: OrderDTO; onCancel?: () => void }) {
  const now = useNow(1000);
  const d = order.delivery;
  if (!d) return null;
  const current = STEPS.findIndex((s) => s.status === order.status);
  const from = { lat: order.machine.lat, lng: order.machine.lng };
  const to = { lat: d.lat, lng: d.lng };

  let courier = null;
  if (order.status === "on_the_way" && order.timeline.onTheWayAt && d.etaAt) {
    const start = Date.parse(order.timeline.onTheWayAt);
    const end = Date.parse(d.etaAt);
    courier = interpolate(from, to, (now - start) / Math.max(1, end - start));
  } else if (order.status === "picked_up") courier = from;
  else if (order.status === "delivered") courier = to;

  return (
    <Card className="overflow-hidden">
      <div className="h-56">
        <MapView machines={[]} route={{ from, to, courier }} className="size-full" />
      </div>
      <div className="p-4">
        <div className="flex items-center justify-between">
          <Badge tone={statusTone(order.status)}>{STATUS_LABEL[order.status]}</Badge>
          {order.status === "on_the_way" && d.etaAt && <span className="text-sm font-semibold">Arrives in {formatCountdown(Date.parse(d.etaAt) - now)}</span>}
        </div>
        {d.driver && (
          <p className="mt-2 text-sm">
            🛵 <strong>{d.driver.name}</strong> · {d.driver.vehicle}
          </p>
        )}
        <ol className="mt-3 grid gap-2">
          {STEPS.map((step, i) => {
            const at = order.timeline[step.key];
            const done = i <= current;
            return (
              <li key={step.status} className="flex items-center gap-3 text-sm">
                <span className={cn("grid size-6 place-items-center rounded-full text-xs", done ? "bg-forest text-white" : "border border-line text-muted")}>
                  {done ? "✓" : i + 1}
                </span>
                <span className={cn("flex-1", !done && "text-muted")}>{step.label}</span>
                {at && <span className="text-xs text-muted">{shortTime(at)}</span>}
              </li>
            );
          })}
        </ol>
        <p className="mt-3 text-xs text-muted">To: {d.address} · {d.km} km from {order.machine.name}</p>
        {onCancel && (
          <Button variant="ghost" className="mt-2 w-full" onClick={onCancel}>
            Cancel order
          </Button>
        )}
      </div>
    </Card>
  );
}

function ReportIssue({ orderId }: { orderId: string }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"not_dispensed" | "wrong_item" | "quality" | "other">("not_dispensed");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api(`/api/orders/${orderId}/issue`, { method: "POST", json: { kind, message: message || "No details" } });
      toast.success("Thanks — we'll sort it out. Refunds go straight to your wallet.");
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't send");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Something wrong? Report it
      </Button>
      <Sheet open={open} onOpenChange={setOpen} title="What went wrong?" description="Most reports are refunded to your wallet within minutes.">
        <div className="grid gap-2">
          {(
            [
              ["not_dispensed", "My item didn't drop / got stuck"],
              ["wrong_item", "I got the wrong item"],
              ["quality", "Quality or freshness problem"],
              ["other", "Something else"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn("rounded-2xl border p-3 text-left text-sm font-medium", kind === value ? "border-forest bg-forest/5" : "border-line")}
            >
              {label}
            </button>
          ))}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Tell us a bit more (optional)"
            className="rounded-2xl border border-line bg-white p-3 text-sm outline-none focus:border-forest"
          />
          <Button size="lg" loading={busy} onClick={submit}>
            Send report
          </Button>
        </div>
      </Sheet>
    </>
  );
}
