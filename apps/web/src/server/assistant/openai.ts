import "server-only";
import OpenAI from "openai";
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

/** OpenAI engine: Chat Completions with function tools, same shared tools and instructions. */

const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = TOOL_DEFINITIONS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.parameters },
}));

/** Reasoning models (gpt-5*, o*) accept reasoning_effort; others reject it. */
const isReasoningModel = (model: string) => /^(gpt-5|o\d)/.test(model);

export async function openAiEngine(
  ctx: AssistantContext,
  message: string,
  history: ChatTurn[],
): Promise<{ reply: string; suggestions: AssistantSuggestion[] }> {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 1, timeout: 45_000 });
  let picks: Picks = [];
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: ASSISTANT_INSTRUCTIONS },
    ...history.slice(-6).map((t) => ({ role: t.role, content: t.content })),
    { role: "user", content: `${contextLine(ctx)}\n${message}` },
  ];

  let reply = "";
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await client.chat.completions.create({
      model: env.OPENAI_MODEL,
      messages,
      tools: TOOLS,
      ...(isReasoningModel(env.OPENAI_MODEL) ? { reasoning_effort: "low" as const } : {}),
    });
    const choice = completion.choices[0];
    if (!choice) break;
    const { message: assistant } = choice;
    if (assistant.refusal) return { reply: "I can't help with that one — but ask me anything about the menu!", suggestions: [] };
    if (assistant.content?.trim()) reply = assistant.content.trim();

    const calls = (assistant.tool_calls ?? []).filter(
      (c): c is OpenAI.Chat.Completions.ChatCompletionMessageFunctionToolCall => c.type === "function",
    );
    if (calls.length === 0) break;

    messages.push({ role: "assistant", content: assistant.content ?? null, tool_calls: calls });
    for (const call of calls) {
      let content: string;
      try {
        const args: unknown = call.function.arguments ? JSON.parse(call.function.arguments) : {};
        content = JSON.stringify(runTool(ctx, call.function.name, args, (p) => (picks = p)));
      } catch (error) {
        content = JSON.stringify({ error: error instanceof Error ? error.message : "Tool failed" });
      }
      messages.push({ role: "tool", tool_call_id: call.id, content });
    }
  }

  return { reply: reply || "Here's what I'd pick:", suggestions: picksToSuggestions(ctx, picks) };
}
