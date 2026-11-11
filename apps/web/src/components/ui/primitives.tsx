import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-[22px] border border-line bg-paper shadow-card", className)} {...props} />;
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "green" | "sun" | "tomato" | "leaf" | "sky" | "dark" }) {
  const tones = {
    neutral: "bg-cream-deep text-ink",
    green: "bg-[#dff1e1] text-[#1f6b35]",
    sun: "bg-sun text-forest-ink",
    tomato: "bg-[#fde3da] text-[#9c2b10]",
    leaf: "bg-leaf/40 text-forest-ink",
    sky: "bg-sky/15 text-sky",
    dark: "bg-forest-ink text-white",
  };
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", tones[tone], className)}
      {...props}
    />
  );
}

export function Chip({ active, className, ...props }: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition",
        active ? "border-forest bg-forest text-white" : "border-line bg-paper text-ink hover:border-forest/40",
        className,
      )}
      {...props}
    />
  );
}

export function SectionTitle({ children, action, className }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("mb-3 flex items-end justify-between gap-3", className)}>
      <h2 className="font-display text-[22px] leading-none tracking-wide text-forest-dark uppercase">{children}</h2>
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-2xl bg-cream-deep", className)} />;
}

export function EmptyState({ title, body, action, art }: { title: string; body?: string; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      {art}
      <p className="font-display text-xl tracking-wide text-forest-dark uppercase">{title}</p>
      {body && <p className="max-w-xs text-sm text-muted">{body}</p>}
      {action}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5 text-sm", className)}>
      <span className="font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-line bg-white px-4 text-[15px] outline-none transition placeholder:text-muted/70 focus:border-forest focus:ring-2 focus:ring-forest/15",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-12 w-full rounded-2xl border border-line bg-white px-3 text-[15px] outline-none focus:border-forest", className)}
      {...props}
    />
  );
}
