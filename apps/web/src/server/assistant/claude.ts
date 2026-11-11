import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/env";
import type { AssistantSuggestion } from "@/lib/types";
import type { AssistantContext } from "./context";
import {
  ASSISTANT_INSTRUCTIONS,
  MAX_TOOL_ROUNDS,
  TOOL_DEFINITIONS,
  contextLine,
  picksToSuggestions,
  runTool,
  type ChatTurn,
  type Picks,
} from "./tools";

/** Claude engine: a short manual tool loop over the shared read-only tools. */

const TOOLS: Anthropic.Beta.BetaTool[] = TOOL_DEFINITIONS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema,
}));

export async function claudeEngine(
  ctx: AssistantContext,
  message: string,
  history: ChatTurn[],
): Promise<{ reply: string; suggestions: AssistantSuggestion[] }> {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 45_000 });
  let picks: Picks = [];
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: `${contextLine(ctx)}\n${message}` },
  ];

  let reply = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.beta.messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: 16000,
      system: ASSISTANT_INSTRUCTIONS,
      tools: TOOLS,
      messages,
      output_config: { effort: "low" }, // quick chat answers; raise for harder routes
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // a safety decline is retried server-side on Anthropic's recommended model
    });

    if (response.stop_reason === "refusal") {
      return { reply: "I can't help with that one — but ask me anything about the menu!", suggestions: [] };
    }
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (text) reply = text;
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (response.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: toolUses.map((tool): Anthropic.Beta.BetaToolResultBlockParam => {
        try {
          return { type: "tool_result", tool_use_id: tool.id, content: JSON.stringify(runTool(ctx, tool.name, tool.input, (p) => (picks = p))) };
        } catch (error) {
          return { type: "tool_result", tool_use_id: tool.id, content: error instanceof Error ? error.message : "Tool failed", is_error: true };
        }
      }),
    });
  }

  return { reply: reply || "Here's what I'd pick:", suggestions: picksToSuggestions(ctx, picks) };
}
