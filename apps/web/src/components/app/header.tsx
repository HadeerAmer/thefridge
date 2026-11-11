"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bell, Wallet } from "lucide-react";
import { formatEgp } from "@/lib/money";
import { useMe, useNotifications } from "@/lib/queries";
import { Logo } from "../brand/brand";
import { ButtonLink } from "../ui/button";

export function HomeHeader() {
  const { data: me, isLoading } = useMe();
  const { data: notifications } = useNotifications(Boolean(me));
  const unread = notifications?.filter((n) => !n.readAt).length ?? 0;

  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-4">
      <Logo size="md" />
      <div className="flex items-center gap-2">
        {me ? (
          <>
            <Link href="/wallet" className="flex items-center gap-1.5 rounded-full bg-paper px-3 py-1.5 text-sm font-semibold shadow-card">
              <Wallet className="size-4 text-forest" />
              {formatEgp(me.walletCents)}
            </Link>
            <Link href="/notifications" aria-label="Notifications" className="relative grid size-9 place-items-center rounded-full bg-paper shadow-card">
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 grid size-4 place-items-center rounded-full bg-tomato text-[10px] font-bold text-white">
                  {unread}
                </span>
              )}
            </Link>
          </>
        ) : (
          !isLoading && (
            <ButtonLink href="/signin" size="sm" variant="primary">
              Sign in
            </ButtonLink>
          )
        )}
      </div>
    </header>
  );
}

/** Title bar for inner screens. */
export function PageHeader({ title, back = true, action }: { title: string; back?: boolean; action?: React.ReactNode }) {
  const router = useRouter();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-cream/90 px-3 py-3 backdrop-blur">
      {back && (
        <button
          type="button"
          aria-label="Back"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className="grid size-10 place-items-center rounded-full bg-paper shadow-card"
        >
          <ArrowLeft className="size-5" />
        </button>
      )}
      <h1 className="flex-1 truncate font-display text-2xl tracking-wide text-forest-dark uppercase">{title}</h1>
      {action}
    </header>
  );
}
