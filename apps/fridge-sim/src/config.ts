import { z } from "zod";

try {
  process.loadEnvFile(".env");
} catch {
  // No .env file — fall back to the development defaults below.
}

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  CLOUD_URL: z.url().default("http://localhost:3000"),
  MACHINE_API_KEY: z.string().min(8).default("dev-machine-api-key"),
  WEBHOOK_SECRET: z.string().min(8).default("dev-webhook-secret"),
  DATA_FILE: z.string().default(".data/state.json"),
});

export const config = EnvSchema.parse(process.env);
export type Config = typeof config;
