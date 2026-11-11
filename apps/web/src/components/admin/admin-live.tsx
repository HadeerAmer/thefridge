"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { relativeTime } from "@/lib/dates";
import type { FeedItem } from "@/lib/types";
import { onAdminEvent } from "../live-updates";

/** Re-renders the current admin page (server components) when live events arrive. */
export function AdminAutoRefresh() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () =>
      onAdminEvent(() => {
        if (timer.current) return;
        timer.current = setTimeout(() => {
          timer.current = null;
          router.refresh();
        }, 1200);
      }),
    [router],
  );
  return null;
}

const ICONS: Record<FeedItem["kind"], string> = { order: "🧾", machine: "🧊", stock: "📦", payment: "💳", issue: "🆘" };

export function LiveFeed({ initial }: { initial: FeedItem[] }) {
  const [items, setItems] = useState(initial);
  useEffect(
    () =>
      onAdminEvent((item) => {
        if (item && typeof item === "object" && "text" in (item as object)) {
          setItems((prev) => [item as FeedItem, ...prev.filter((p) => p.id !== (item as FeedItem).id)].slice(0, 30));
        }
      }),
    [],
  );
  return (
    <ul className="grid max-h-[420px] gap-2 overflow-y-auto pr-1">
      {items.length === 0 && <li className="text-sm text-muted">Waiting for activity… reserve something in the app or buy at the fridge simulator.</li>}
      {items.map((item) => (
        <li key={item.id} className="flex animate-rise gap-2 rounded-xl bg-cream/70 px-3 py-2 text-sm">
          <span>{ICONS[item.kind]}</span>
          <span className="flex-1">{item.text}</span>
          <span className="shrink-0 text-[11px] text-muted">{relativeTime(item.at)}</span>
        </li>
      ))}
    </ul>
  );
}
