import { cn } from "@/lib/cn";

/** "THE FRIDGE" wordmark + optional hand-written tagline. */
export function Logo({ className, tagline = false, size = "md" }: { className?: string; tagline?: boolean; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-5xl" };
  return (
    <span className={cn("inline-flex flex-col leading-none", className)}>
      <span className={cn("wordmark", sizes[size])}>THE FRIDGE</span>
      {tagline && <span className="mt-1 font-hand text-lg text-tomato">Always a good cal(l)</span>}
    </span>
  );
}

/** Our little fridge mascot (chef hat, happy face). */
export function Mascot({ className, wave = false }: { className?: string; wave?: boolean }) {
  return (
    <svg viewBox="0 0 120 140" className={className} aria-hidden>
      {/* chef hat */}
      <g fill="#fffdf8" stroke="#143d23" strokeWidth="3" strokeLinejoin="round">
        <path d="M38 34c-9 0-13-11-5-16 2-9 14-11 18-5 4-8 18-8 21 1 9-3 17 6 11 14 4 7-3 12-9 10H44c-3 0-5-2-6-4z" />
        <rect x="42" y="30" width="38" height="10" rx="3" />
      </g>
      {/* body */}
      <rect x="28" y="40" width="66" height="84" rx="14" fill="#fffdf8" stroke="#143d23" strokeWidth="3.5" />
      <path d="M28 64h66" stroke="#143d23" strokeWidth="3" />
      <rect x="82" y="48" width="5" height="10" rx="2.5" fill="#143d23" />
      <rect x="82" y="72" width="5" height="16" rx="2.5" fill="#143d23" />
      {/* face */}
      <path d="M47 86c2-3 6-3 8 0M66 86c2-3 6-3 8 0" fill="none" stroke="#143d23" strokeWidth="3" strokeLinecap="round" />
      <path d="M52 96c5 6 13 6 18 0" fill="none" stroke="#143d23" strokeWidth="3" strokeLinecap="round" />
      <circle cx="46" cy="94" r="3.5" fill="#f4a09a" />
      <circle cx="76" cy="94" r="3.5" fill="#f4a09a" />
      {/* apron */}
      <path d="M40 104h42v14a6 6 0 0 1-6 6H46a6 6 0 0 1-6-6z" fill="#1f5a34" stroke="#143d23" strokeWidth="3" />
      {/* feet */}
      <ellipse cx="46" cy="127" rx="8" ry="4" fill="#143d23" />
      <ellipse cx="76" cy="127" rx="8" ry="4" fill="#143d23" />
      {/* arm */}
      {wave ? (
        <path d="M94 92c8-4 12-14 10-24" fill="none" stroke="#143d23" strokeWidth="3.5" strokeLinecap="round" className="origin-[94px_92px] animate-[wave_1.6s_ease-in-out_infinite]" />
      ) : (
        <path d="M94 92c6 2 9 8 8 14" fill="none" stroke="#143d23" strokeWidth="3.5" strokeLinecap="round" />
      )}
      <path d="M28 92c-6 2-9 8-8 14" fill="none" stroke="#143d23" strokeWidth="3.5" strokeLinecap="round" />
      <style>{`@keyframes wave { 0%,100% { transform: rotate(0deg) } 50% { transform: rotate(-14deg) } }`}</style>
    </svg>
  );
}

/** Round sticker like "FRESH DAILY" / "HIGH PROTEIN" on the menu. */
export function Sticker({
  children,
  tone = "sun",
  className,
  rotate = -8,
}: {
  children: React.ReactNode;
  tone?: "sun" | "leaf" | "tomato" | "orange" | "cream";
  className?: string;
  rotate?: number;
}) {
  const tones = {
    sun: "bg-sun text-forest-ink",
    leaf: "bg-leaf text-forest-ink",
    tomato: "bg-tomato text-white",
    orange: "bg-orange text-white",
    cream: "bg-paper text-forest-dark",
  };
  return (
    <span
      style={{ transform: `rotate(${rotate}deg)` }}
      className={cn(
        "inline-grid place-items-center rounded-full border-2 border-dashed border-forest-ink/30 px-2 text-center text-[10px] leading-tight font-extrabold tracking-wide uppercase",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Hand-drawn underline under headings. */
export function Squiggle({ className, color = "#e2481f" }: { className?: string; color?: string }) {
  return (
    <svg viewBox="0 0 120 10" preserveAspectRatio="none" className={className} aria-hidden>
      <path d="M2 6c12-5 22 4 34 0s22-5 34 0 22 4 34 0 10-3 14-2" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
