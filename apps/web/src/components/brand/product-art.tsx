"use client";

import { memo, useId } from "react";
import type { Category } from "@/lib/types";

/**
 * Drawn product visuals in The Fridge's packaging style:
 * layered salads in clear jars with green lids and a cream mascot label,
 * plus bowls, wraps, paninis, dessert cups, drinks and snack packs.
 */

type Props = { category: Category; layers: string[]; accent: string; label?: string; className?: string };

const INK = "#143d23";

function hash(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic little "bits" (leaves, corn, crumbs) so contents look textured. */
function bits(seed: string, colors: string[], area: { x: number; y: number; w: number; h: number }, count = 14) {
  let h = hash(seed);
  const next = () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
  return Array.from({ length: count }, (_, i) => ({
    key: i,
    cx: area.x + next() * area.w,
    cy: area.y + next() * area.h,
    r: 1.6 + next() * 2.6,
    fill: colors[Math.floor(next() * colors.length)] ?? "#fff",
  }));
}

function Bands({ layers, x, y, w, h, wavy = true }: { layers: string[]; x: number; y: number; w: number; h: number; wavy?: boolean }) {
  const n = Math.max(1, layers.length);
  const bandH = h / n;
  return (
    <>
      {layers.map((color, i) => {
        const top = y + i * bandH;
        if (!wavy || i === 0) return <rect key={i} x={x} y={top} width={w} height={bandH + 1} fill={color} />;
        const amp = 2.2;
        const steps = 6;
        let d = `M${x} ${top}`;
        for (let s = 1; s <= steps; s++) {
          const px = x + (w / steps) * s;
          const py = top + (s % 2 === 0 ? -amp : amp);
          d += ` Q${px - w / steps / 2} ${py} ${px} ${top}`;
        }
        d += ` V${top + bandH + 1} H${x} Z`;
        return <path key={i} d={d} fill={color} />;
      })}
    </>
  );
}

export const ProductArt = memo(function ProductArt({ category, layers, accent, label, className }: Props) {
  const id = useId().replace(/:/g, "");
  const seed = `${label ?? ""}${layers.join("")}`;
  const palette = layers.length ? layers : ["#a9c46c"];

  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={label ? `${label} illustration` : "Product illustration"}>
      <circle cx="60" cy="64" r="50" fill={accent} opacity="0.13" />
      {category === "salad" && <Jar id={id} layers={palette} seed={seed} />}
      {category === "bowl" && <Bowl id={id} layers={palette} seed={seed} />}
      {category === "wrap" && <Wrap layers={palette} seed={seed} />}
      {category === "sandwich" && <Panini layers={palette} />}
      {category === "dessert" && <Cup id={id} layers={palette} seed={seed} />}
      {category === "drink" && <Drink id={id} layers={palette} />}
      {category === "snack" && <Pack layers={palette} seed={seed} />}
    </svg>
  );
});

function Jar({ id, layers, seed }: { id: string; layers: string[]; seed: string }) {
  const clip = `jar-${id}`;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x="34" y="31" width="52" height="76" rx="11" />
        </clipPath>
      </defs>
      <rect x="31" y="27" width="58" height="84" rx="14" fill="#eef6f1" stroke={INK} strokeWidth="3" />
      <g clipPath={`url(#${clip})`}>
        <Bands layers={layers} x={34} y={31} w={52} h={76} />
        {bits(seed, layers, { x: 36, y: 34, w: 48, h: 70 }).map((b) => (
          <circle key={b.key} cx={b.cx} cy={b.cy} r={b.r} fill={b.fill} stroke="rgba(20,61,35,0.25)" strokeWidth="0.6" />
        ))}
      </g>
      <rect x="35" y="33" width="7" height="68" rx="3.5" fill="#fff" opacity="0.45" />
      {/* label */}
      <rect x="44" y="54" width="32" height="30" rx="8" fill="#fffaf0" stroke={INK} strokeWidth="2" />
      <text x="60" y="64" textAnchor="middle" fontSize="6.2" fontWeight="900" fill="#1f5a34" fontFamily="var(--font-brand), sans-serif">
        THE FRIDGE
      </text>
      <path d="M54 71c1.2-1.6 3-1.6 4.2 0M61.8 71c1.2-1.6 3-1.6 4.2 0" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M56.5 76c2 2 5 2 7 0" fill="none" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
      {/* lid */}
      <rect x="28" y="14" width="64" height="17" rx="6" fill="#2f8a3f" stroke={INK} strokeWidth="3" />
      {[38, 46, 54, 62, 70, 78].map((x) => (
        <line key={x} x1={x} y1="18" x2={x} y2="27" stroke={INK} strokeWidth="1.2" opacity="0.35" />
      ))}
    </g>
  );
}

function Bowl({ id, layers, seed }: { id: string; layers: string[]; seed: string }) {
  const clip = `bowl-${id}`;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d="M22 62h76c0 24-17 40-38 40S22 86 22 62z" />
        </clipPath>
      </defs>
      {/* steam */}
      {[46, 60, 74].map((x, i) => (
        <path key={x} d={`M${x} ${40 - i}c-4-6 4-8 0-14`} fill="none" stroke={INK} strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
      ))}
      {/* food mound */}
      <ellipse cx="60" cy="62" rx="36" ry="12" fill={layers[0]} stroke={INK} strokeWidth="2.5" />
      {bits(seed, layers, { x: 32, y: 54, w: 56, h: 10 }, 12).map((b) => (
        <circle key={b.key} cx={b.cx} cy={b.cy} r={b.r} fill={b.fill} stroke="rgba(20,61,35,0.3)" strokeWidth="0.6" />
      ))}
      <path d="M22 62h76c0 24-17 40-38 40S22 86 22 62z" fill="#fffdf8" stroke={INK} strokeWidth="3" />
      <g clipPath={`url(#${clip})`}>
        <rect x="22" y="62" width="76" height="8" fill={layers[1] ?? layers[0]} opacity="0.35" />
      </g>
      <path d="M36 84c8 6 40 6 48 0" fill="none" stroke="#1f5a34" strokeWidth="2.5" strokeLinecap="round" />
      <ellipse cx="60" cy="104" rx="20" ry="4" fill={INK} opacity="0.12" />
    </g>
  );
}

function Wrap({ layers, seed }: { layers: string[]; seed: string }) {
  return (
    <g>
      {/* back half */}
      <path d="M18 58c0-14 12-24 30-24h28l-10 52H44C28 86 18 74 18 58z" fill="#f1d7a6" stroke={INK} strokeWidth="3" />
      {/* cut face */}
      <ellipse cx="74" cy="60" rx="18" ry="27" fill="#f1d7a6" stroke={INK} strokeWidth="3" />
      <ellipse cx="74" cy="60" rx="13" ry="21" fill={layers[0]} />
      {bits(seed, layers, { x: 64, y: 44, w: 20, h: 32 }, 12).map((b) => (
        <circle key={b.key} cx={b.cx} cy={b.cy} r={b.r} fill={b.fill} stroke="rgba(20,61,35,0.3)" strokeWidth="0.6" />
      ))}
      {/* paper band */}
      <path d="M30 40l16 46" stroke="#fffaf0" strokeWidth="12" />
      <path d="M30 40l16 46" stroke={INK} strokeWidth="1.5" strokeDasharray="3 3" opacity="0.4" />
      {[30, 42, 54].map((x) => (
        <circle key={x} cx={x} cy={64 - (x - 30) / 4} r="1.6" fill="#c58c4a" />
      ))}
    </g>
  );
}

function Panini({ layers }: { layers: string[] }) {
  const filling = layers.slice(0, 3);
  return (
    <g>
      {/* back triangle */}
      <path d="M26 92 64 30l36 62z" fill="#e9c27a" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {/* filling stripes */}
      {filling.map((c, i) => (
        <path key={i} d={`M${22 + i * 2} ${94 - i * 4}h${80 - i * 4}`} stroke={c} strokeWidth="5" strokeLinecap="round" />
      ))}
      {/* front triangle */}
      <path d="M20 100 56 42l38 58z" fill="#f2d08f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${40 + i * 10} ${86 - i * 2}l12-18`} stroke="#9b5a22" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      ))}
    </g>
  );
}

function Cup({ id, layers, seed }: { id: string; layers: string[]; seed: string }) {
  const clip = `cup-${id}`;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d="M33 38h54l-6 66H39z" />
        </clipPath>
      </defs>
      <path d="M30 34h60l-7 74H37z" fill="#eef6f1" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <g clipPath={`url(#${clip})`}>
        <Bands layers={layers} x={30} y={38} w={60} h={66} />
      </g>
      {/* topping */}
      <path d="M38 36c0-10 10-12 14-8 2-8 14-8 16 0 4-4 14-2 14 8z" fill="#fffdf8" stroke={INK} strokeWidth="2.5" />
      {bits(seed, [layers[layers.length - 1] ?? "#c68b3e"], { x: 44, y: 26, w: 32, h: 6 }, 5).map((b) => (
        <circle key={b.key} cx={b.cx} cy={b.cy} r={1.8} fill={b.fill} />
      ))}
      <rect x="35" y="44" width="5" height="56" rx="2.5" fill="#fff" opacity="0.4" />
    </g>
  );
}

function Drink({ id, layers }: { id: string; layers: string[] }) {
  const clip = `drink-${id}`;
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <path d="M38 40h44l-5 64H43z" />
        </clipPath>
      </defs>
      <path d="M68 14l-8 30" stroke="#e2481f" strokeWidth="5" strokeLinecap="round" />
      <path d="M68 14l-8 30" stroke="#fff" strokeWidth="1.6" strokeDasharray="3 4" strokeLinecap="round" />
      <path d="M36 34c0-10 48-10 48 0" fill="#fffdf8" stroke={INK} strokeWidth="2.5" />
      <path d="M34 36h52l-6 72H40z" fill="#eef6f1" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <g clipPath={`url(#${clip})`}>
        <Bands layers={layers} x={34} y={40} w={52} h={64} wavy={false} />
      </g>
      <circle cx="52" cy="62" r="3" fill="#fff" opacity="0.6" />
      <circle cx="62" cy="80" r="2" fill="#fff" opacity="0.6" />
      <rect x="40" y="44" width="5" height="56" rx="2.5" fill="#fff" opacity="0.35" />
    </g>
  );
}

function Pack({ layers, seed }: { layers: string[]; seed: string }) {
  return (
    <g>
      <path d="M28 30h64l-4 76H32z" fill="#fffaf0" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <path d="M28 30l4-8h56l4 8" fill="#2f8a3f" stroke={INK} strokeWidth="3" strokeLinejoin="round" />
      <rect x="36" y="56" width="48" height="40" rx="10" fill="#eef6f1" stroke={INK} strokeWidth="2" />
      {bits(seed, layers, { x: 42, y: 62, w: 36, h: 28 }, 7).map((b) => (
        <circle key={b.key} cx={b.cx} cy={b.cy} r={5} fill={b.fill} stroke={INK} strokeWidth="1.2" />
      ))}
      <text x="60" y="47" textAnchor="middle" fontSize="7" fontWeight="900" fill="#1f5a34" fontFamily="var(--font-brand), sans-serif">
        THE FRIDGE
      </text>
    </g>
  );
}
