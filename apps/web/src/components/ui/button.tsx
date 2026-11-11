import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "accent" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-forest text-white hover:bg-forest-dark shadow-[0_8px_18px_-10px_rgba(20,61,35,0.7)]",
  secondary: "bg-cream-deep text-ink hover:bg-[#e6dcc8]",
  accent: "bg-sun text-forest-ink hover:brightness-95 shadow-[0_8px_18px_-10px_rgba(160,120,0,0.7)]",
  ghost: "bg-transparent text-forest hover:bg-forest/5",
  danger: "bg-[#fde3da] text-[#9c2b10] hover:bg-[#fbd3c5]",
  outline: "border border-line bg-paper text-ink hover:bg-cream",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-xl",
  md: "h-11 px-4 text-[15px] rounded-2xl",
  lg: "h-14 px-6 text-base rounded-2xl",
};

export function buttonClasses({ variant = "primary", size = "md", className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap transition active:scale-[0.98]",
    "disabled:pointer-events-none disabled:opacity-50 select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-forest",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean };

export function Button({ variant, size, loading, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses({ variant, size, className })} disabled={disabled || loading} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClasses({ variant, size, className })} {...props} />;
}

export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn("size-4 animate-spin rounded-full border-2 border-current border-t-transparent", className)} />;
}
