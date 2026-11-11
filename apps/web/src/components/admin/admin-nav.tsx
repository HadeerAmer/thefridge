"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bike, Gauge, MessageSquareWarning, Package, ReceiptText, Refrigerator, Settings, Users } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/machines", label: "Machines & stock", icon: Refrigerator },
  { href: "/admin/orders", label: "Orders", icon: ReceiptText },
  { href: "/admin/delivery", label: "Delivery board", icon: Bike },
  { href: "/admin/products", label: "Products & prices", icon: Package },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/feedback", label: "Issues & requests", icon: MessageSquareWarning },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition",
              active ? "bg-white/12 text-sun" : "text-white/75 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
      <span className="hidden items-center gap-2 px-3 pt-4 text-xs text-white/60 lg:flex">
        <span className="size-2 animate-pulse rounded-full bg-leaf" /> Live — updates as fridges report
      </span>
    </nav>
  );
}
