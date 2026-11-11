"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { relativeTime } from "@/lib/dates";
import { keys, useMe, useNotifications } from "@/lib/queries";
import { PageHeader } from "@/components/app/header";
import { EmptyState } from "@/components/ui/primitives";

export default function NotificationsPage() {
  const { data: me } = useMe();
  const { data: notifications } = useNotifications(Boolean(me));
  const qc = useQueryClient();

  // Opening the inbox marks everything read.
  useEffect(() => {
    if (!notifications?.some((n) => !n.readAt)) return;
    const t = setTimeout(() => {
      void api("/api/notifications", { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: keys.notifications }));
    }, 1200);
    return () => clearTimeout(t);
  }, [notifications, qc]);

  return (
    <div>
      <PageHeader title="Notifications" />
      {notifications?.length === 0 && <EmptyState title="All quiet" body="Order updates, back-in-stock alerts and rewards show up here." />}
      <ul className="grid gap-2 px-4">
        {notifications?.map((n) => {
          const body = (
            <div className={`flex gap-3 rounded-2xl border p-3 ${n.readAt ? "border-line bg-paper" : "border-forest/30 bg-forest/5"}`}>
              <span className="text-xl">{{ order: "🧊", loyalty: "⭐", stock: "🔔", system: "💚" }[n.kind]}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{n.title}</p>
                <p className="text-sm text-muted">{n.body}</p>
                <p className="mt-1 text-[11px] text-muted">{relativeTime(n.createdAt)}</p>
              </div>
            </div>
          );
          return <li key={n.id}>{n.href ? <Link href={n.href}>{body}</Link> : body}</li>;
        })}
      </ul>
    </div>
  );
}
