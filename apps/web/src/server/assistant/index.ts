import "server-only";
import { z } from "zod";
import { env } from "@/env";
import type { AssistantReply } from "@/lib/types";
import { claudeEngine } from "./claude";
import { buildContext } from "./context";
import { openAiEngine } from "./openai";
import { rulesEngine } from "./rules";

export const AskSchema = z.object({
  message: z.string().trim().min(1).max(500),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(2000) })).max(12).default([]),
  machineId: z.string().nullable().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

type Engine = "openai" | "claude" | "rules";

/** AI_PROVIDER picks the engine; "auto" uses whichever API key is configured. */
export function activeEngine(): Engine {
  const provider = env.AI_PROVIDER;
  if (provider === "openai" && env.OPENAI_API_KEY) return "openai";
  if (provider === "anthropic" && env.ANTHROPIC_API_KEY) return "claude";
  if (provider === "auto") {
    if (env.OPENAI_API_KEY) return "openai";
    if (env.ANTHROPIC_API_KEY) return "claude";
  }
  return "rules";
}

/** Answers with the configured LLM; falls back to the built-in rules engine if it errors. */
export async function ask(userId: string | null, input: z.infer<typeof AskSchema>): Promise<AssistantReply> {
  const ctx = await buildContext({
    userId,
    machineId: input.machineId ?? null,
    near: input.lat !== undefined && input.lng !== undefined ? { lat: input.lat, lng: input.lng } : null,
  });

  const engine = activeEngine();
  if (engine !== "rules") {
    try {
      const result =
        engine === "openai"
          ? await openAiEngine(ctx, input.message, input.history)
          : await claudeEngine(ctx, input.message, input.history);
      return { ...result, engine };
    } catch (error) {
      console.error(`[assistant] ${engine} failed, using the rules engine:`, error instanceof Error ? error.message : error);
    }
  }
  return { ...rulesEngine(ctx, input.message), engine: "rules" };
}
