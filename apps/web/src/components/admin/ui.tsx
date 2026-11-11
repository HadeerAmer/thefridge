"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { Button } from "../ui/button";

export function AdminTitle({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-4xl tracking-wide text-forest-dark uppercase">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Kpi({ label, value, hint, tone = "default" }: { label: string; value: string; hint?: string; tone?: "default" | "alert" | "good" }) {
  return (
    <div
      className={cn(
        "rounded-[20px] border bg-paper p-4 shadow-card",
        tone === "alert" ? "border-tomato/40" : tone === "good" ? "border-forest/30" : "border-line",
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
      <p className={cn("mt-1 font-display text-3xl tracking-wide", tone === "alert" ? "text-tomato" : "text-forest-dark")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[22px] border border-line bg-paper p-5 shadow-card", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-xl tracking-wide text-forest-dark uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

type ActionResult = { ok: boolean; message?: string };

/** Runs a server action with pending state and a toast. */
export function ActionButton({
  action,
  children,
  confirm,
  variant = "secondary",
  size = "sm",
  className,
}: {
  action: () => Promise<ActionResult>;
  children: React.ReactNode;
  confirm?: string;
  variant?: "primary" | "secondary" | "accent" | "danger" | "outline" | "ghost";
  size?: "sm" | "md";
  className?: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      loading={pending}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => {
          const result = await action();
          if (result.ok) toast.success(result.message ?? "Done");
          else toast.error(result.message ?? "Failed");
        });
      }}
    >
      {children}
    </Button>
  );
}

export function StatusDot({ tone }: { tone: "green" | "amber" | "red" | "grey" }) {
  const colors = { green: "bg-[#34b05a]", amber: "bg-orange", red: "bg-tomato", grey: "bg-[#b8b2a7]" };
  return <span className={cn("inline-block size-2.5 rounded-full", colors[tone])} />;
}
