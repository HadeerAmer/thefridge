import "server-only";
import { z } from "zod";

/** Server environment, validated once at startup. Dev defaults keep `npm run dev` zero-config. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/thefridge_demo?replicaSet=rs0"),
  SESSION_SECRET: z.string().min(32).default("dev-only-change-me-0f3c9a7e5b2d4c18a6e7f9b1c2d3e4f5"),
  FRIDGE_API_URL: z.url().default("http://localhost:4000"),
  FRIDGE_API_KEY: z.string().min(8).default("dev-machine-api-key"),
  MACHINE_WEBHOOK_SECRET: z.string().min(8).default("dev-webhook-secret"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  DEMO_OTP: z.string().regex(/^\d{4,6}$/).default("1234"),
  /** Which LLM powers "Ask The Fridge": auto = whichever key is set (OpenAI first), else the rules engine. */
  AI_PROVIDER: z.enum(["auto", "openai", "anthropic", "rules"]).default("auto"),
  OPENAI_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  OPENAI_MODEL: z.string().default("gpt-5-mini"),
  ANTHROPIC_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
});

export const env = EnvSchema.parse(process.env);
