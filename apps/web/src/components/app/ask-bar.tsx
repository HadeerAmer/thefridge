"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUp, Sparkles } from "lucide-react";

const PROMPTS = [
  "30 g protein under EGP 160",
  "Something light, under 400 kcal",
  "Vegetarian lunch near me",
  "What fits my macros today?",
  "Low carb and filling",
];

/** "Ask The Fridge" — the AI text box on Home. */
export function AskBar() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [hint, setHint] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setHint((h) => (h + 1) % PROMPTS.length), 3200);
    return () => clearInterval(id);
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/ask?q=${encodeURIComponent(value.trim() || PROMPTS[hint]!)}`);
      }}
      className="flex items-center gap-2 rounded-2xl border border-line bg-paper p-1.5 pl-3 shadow-card focus-within:border-forest"
    >
      <Sparkles className="size-5 shrink-0 text-orange" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Ask The Fridge… “${PROMPTS[hint]}”`}
        className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/80"
        aria-label="Ask The Fridge"
      />
      <button type="submit" aria-label="Ask" className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest text-white">
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}

export const ASK_PROMPTS = PROMPTS;
