"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, MapPin, ReceiptText, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/cn";
import { useOrders, useMe } from "@/lib/queries";

const ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/fridges", label: "Fridges", icon: MapPin },
  { href: "/ask", label: "Ask", icon: Sparkles, center: true },
  { href: "/orders", label: "Orders", icon: ReceiptText },
  { href: "/profile", label: "Me", icon: User },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const { data: orders } = useOrders(Boolean(me));
  const active = orders?.filter((o) => ["reserved", "placed", "assigned", "picked_up", "on_the_way"].includes(o.status)).length ?? 0;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="grid grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon, ...rest }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const center = "center" in rest;
          return (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold",
                  isActive ? "text-forest" : "text-muted",
                )}
                aria-current={isActive ? "page" : undefined}
              >
                {center ? (
                  <span className="-mt-7 grid size-14 place-items-center rounded-full border-4 border-paper bg-forest text-sun shadow-float">
                    <Icon className="size-6" />
                  </span>
                ) : (
                  <Icon className={cn("size-[22px]", isActive && "stroke-[2.5]")} />
                )}
                <span>{label}</span>
                {href === "/orders" && active > 0 && (
                  <span className="absolute top-2 right-[calc(50%-18px)] grid size-4 place-items-center rounded-full bg-tomato text-[10px] text-white">
                    {active}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
