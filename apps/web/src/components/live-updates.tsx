"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import { keys, useMe } from "@/lib/queries";
import type { OrderDTO, RealtimeEvent } from "@/lib/types";
import { useLiveStock } from "@/stores/live";
import { useCelebration } from "./app/celebration";

const ADMIN_EVENT = "tf:admin";

/**
 * One SSE connection per tab. Applies live stock, keeps cached orders fresh,
 * shows notifications as toasts and celebrates completed orders.
 * Reconnects when the signed-in user changes (the server picks channels from the session).
 */
export function LiveUpdates() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const applyStock = useLiveStock((s) => s.apply);
  const celebrate = useCelebration((s) => s.show);
  const userKey = me?.id ?? "guest";

  useEffect(() => {
    const source = new EventSource("/api/stream");
    source.addEventListener("message", (raw) => {
      let event: RealtimeEvent;
      try {
        event = JSON.parse((raw as MessageEvent<string>).data) as RealtimeEvent;
      } catch {
        return;
      }
      switch (event.type) {
        case "stock":
          applyStock(event.machineId, event.items);
          break;
        case "machine":
          void qc.invalidateQueries({ queryKey: ["machines"] });
          void qc.invalidateQueries({ queryKey: ["menu"] });
          break;
        case "order":
          qc.setQueryData<OrderDTO>(keys.order(event.order.id), event.order);
          void qc.invalidateQueries({ queryKey: keys.orders });
          if (event.celebrate) {
            celebrate({ order: event.order, celebration: event.celebrate });
            void qc.invalidateQueries({ queryKey: keys.today });
          }
          window.dispatchEvent(new CustomEvent(ADMIN_EVENT));
          break;
        case "notification":
          if (!event.notification.title.startsWith("Enjoy") && !event.notification.title.startsWith("Delivered")) {
            toast(event.notification.title, { description: event.notification.body });
          }
          void qc.invalidateQueries({ queryKey: keys.notifications });
          break;
        case "me":
          void qc.invalidateQueries({ queryKey: keys.me });
          void qc.invalidateQueries({ queryKey: keys.today });
          void qc.invalidateQueries({ queryKey: keys.wallet });
          break;
        case "feed":
          window.dispatchEvent(new CustomEvent(ADMIN_EVENT, { detail: event.item }));
          break;
      }
    });
    return () => source.close();
  }, [userKey, qc, applyStock, celebrate]);

  return null;
}

/** Admin screens listen for this to refresh themselves. */
export function onAdminEvent(handler: (item?: unknown) => void) {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  window.addEventListener(ADMIN_EVENT, listener);
  return () => window.removeEventListener(ADMIN_EVENT, listener);
}
