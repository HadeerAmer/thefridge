"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, MapPin, Plus, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import { formatDistance } from "@/lib/geo";
import { formatEgp } from "@/lib/money";
import type { AssistantReply, AssistantSuggestion } from "@/lib/types";
import { useCart } from "@/stores/cart";
import { useLocationStore } from "@/stores/location";
import { Mascot } from "../brand/brand";
import { ProductArt } from "../brand/product-art";
import { ASK_PROMPTS } from "../app/ask-bar";
import { PageHeader } from "../app/header";
import { useQuickReserve } from "../app/use-quick-reserve";
import { Button } from "../ui/button";

type Message =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; suggestions: AssistantSuggestion[]; engine: AssistantReply["engine"] };

const ENGINE_LABEL: Record<AssistantReply["engine"], string> = {
  openai: "Powered by OpenAI",
  claude: "Powered by Claude",
  rules: "Smart picks (offline mode)",
};

export function AskScreen() {
  const params = useSearchParams();
  const { machineId, coords, setMachine } = useLocationStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const sentInitial = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const message = text.trim();
    if (!message || pending) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setPending(true);
    try {
      const reply = await api<AssistantReply>("/api/assistant", {
        method: "POST",
        json: { message, history, machineId, ...(coords ? { lat: coords.lat, lng: coords.lng } : {}) },
      });
      setMessages((prev) => [...prev, { role: "assistant", content: reply.reply, suggestions: reply.suggestions, engine: reply.engine }]);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The assistant is unavailable right now");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    const q = params.get("q");
    if (q && !sentInitial.current) {
      sentInitial.current = true;
      void send(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  const lastEngine = [...messages].reverse().find((m): m is Extract<Message, { role: "assistant" }> => m.role === "assistant")?.engine;

  return (
    <div className="flex min-h-[calc(100dvh-7rem)] flex-col">
      <PageHeader
        title="Ask The Fridge"
        back={false}
        action={lastEngine && <span className="rounded-full bg-paper px-2.5 py-1 text-[11px] font-semibold text-muted shadow-card">{ENGINE_LABEL[lastEngine]}</span>}
      />

      <div className="flex-1 space-y-4 px-4 pb-36">
        {messages.length === 0 && (
          <div className="flex flex-col items-center pt-4 text-center">
            <Mascot wave className="h-28 w-24" />
            <p className="mt-2 font-display text-2xl tracking-wide text-forest-dark uppercase">What are you craving?</p>
            <p className="mt-1 max-w-xs text-sm text-muted">I know today's menu, what's in stock near you, and your macros. Ask in plain words.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {ASK_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => send(p)}
                  className="rounded-full border border-line bg-paper px-3.5 py-2 text-sm font-medium shadow-card hover:border-forest/40"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[80%] rounded-3xl rounded-br-lg bg-forest px-4 py-2.5 text-[15px] text-white">{m.content}</p>
            </div>
          ) : (
            <div key={i} className="grid gap-2">
              <div className="flex items-start gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-sun text-forest-ink">
                  <Sparkles className="size-4" />
                </span>
                <p className="max-w-[85%] rounded-3xl rounded-tl-lg bg-paper px-4 py-2.5 text-[15px] shadow-card">{m.content}</p>
              </div>
              {m.suggestions.map((s) => (
                <SuggestionCard key={s.product.sku} suggestion={s} onSwitch={setMachine} />
              ))}
            </div>
          ),
        )}

        {pending && (
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="grid size-8 place-items-center rounded-full bg-sun text-forest-ink">
              <Sparkles className="size-4 animate-pulse" />
            </span>
            Checking the fridge…
          </div>
        )}
        <div ref={bottom} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
        className="fixed inset-x-0 bottom-16 z-20 mx-auto flex max-w-[480px] items-center gap-2 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. something vegetarian with 20 g protein"
          aria-label="Ask The Fridge"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-white px-4 text-[15px] outline-none focus:border-forest"
        />
        <button type="submit" aria-label="Send" disabled={pending} className="grid size-12 place-items-center rounded-2xl bg-forest text-white disabled:opacity-50">
          <ArrowUp className="size-5" />
        </button>
      </form>
    </div>
  );
}

function SuggestionCard({ suggestion, onSwitch }: { suggestion: AssistantSuggestion; onSwitch: (id: string) => void }) {
  const { product, reason, alternative } = suggestion;
  const { reserve, pending } = useQuickReserve();
  const add = useCart((s) => s.add);
  const available = product.stock?.available ?? 0;

  return (
    <div className="ml-10 flex animate-rise gap-3 rounded-[22px] border border-line bg-paper p-3 shadow-card">
      <Link href={`/p/${product.slug}`} className="size-20 shrink-0 rounded-2xl bg-cream">
        <ProductArt category={product.category} layers={product.art.layers} accent={product.art.accent} label={product.shortName} className="size-full" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/p/${product.slug}`} className="block truncate font-semibold">
          {product.name}
        </Link>
        <p className="text-xs text-muted">{reason}</p>
        <p className="mt-0.5 text-[11px] text-muted">
          {product.nutrition.kcal} kcal · P {product.nutrition.proteinG} g · C {product.nutrition.carbsG} g · F {product.nutrition.fatG} g
        </p>
        {alternative ? (
          <button type="button" onClick={() => onSwitch(alternative.machineId)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-forest">
            <MapPin className="size-3.5" /> Sold out here — {alternative.available} at {alternative.machineName}
            {alternative.distanceKm !== null && ` (${formatDistance(alternative.distanceKm)})`} · switch
          </button>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" loading={pending} disabled={available === 0} onClick={() => reserve(product)}>
              <Zap className="size-4" /> {formatEgp(product.appPriceCents)}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={`Add ${product.name} to cart`}
              onClick={() => {
                add(product.sku);
                toast.success(`${product.shortName} added`);
              }}
            >
              <Plus className="size-4" />
            </Button>
            <span className="text-[11px] font-semibold text-forest">{available} left</span>
          </div>
        )}
      </div>
    </div>
  );
}
