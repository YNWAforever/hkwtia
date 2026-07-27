import "server-only";

import {z} from "zod";

export interface ServerEnv {
  databaseUrl: string;
  neonAuthBaseUrl: string;
  neonAuthCookieSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeStartupPriceId: string;
  stripeCorporatePriceId: string;
  resendApiKey: string;
  emailFrom: string;
  emailDeliveryMode: "resend" | "test";
  cronSecret: string;
  appUrl: string;
  agentsEnabled: boolean;
  agentModelConcierge: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  conciergeCookieSecret?: string;
  woztellApiToken?: string;
  woztellChannelId?: string;
  woztellWebhookSecret?: string;
  turnstileSecret?: string;
}

export interface PublicEnv {
  siteUrl: string;
}

type Environment = Partial<NodeJS.ProcessEnv>;

const serverKeys = [
  ["DATABASE_URL", "databaseUrl"],
  ["NEON_AUTH_BASE_URL", "neonAuthBaseUrl"],
  ["NEON_AUTH_COOKIE_SECRET", "neonAuthCookieSecret"],
  ["STRIPE_SECRET_KEY", "stripeSecretKey"],
  ["STRIPE_WEBHOOK_SECRET", "stripeWebhookSecret"],
  ["STRIPE_STARTUP_PRICE_ID", "stripeStartupPriceId"],
  ["STRIPE_CORPORATE_PRICE_ID", "stripeCorporatePriceId"],
  ["RESEND_API_KEY", "resendApiKey"],
  ["EMAIL_FROM", "emailFrom"],
  ["CRON_SECRET", "cronSecret"],
  ["APP_URL", "appUrl"],
] as const;

function valueFor(environment: Environment, key: string): string {
  return environment[key] ?? "";
}
const aiEnvironmentSchema = z.object({
  AGENTS_ENABLED: z.string().optional().transform((value) => value === "true"),
  AGENT_MODEL_CONCIERGE: z.string().default("openai:gpt-4.1-mini"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CONCIERGE_COOKIE_SECRET: z.string().min(32).optional(),
  WOZTELL_API_TOKEN: z.string().optional(),
  WOZTELL_CHANNEL_ID: z.string().optional(),
  WOZTELL_WEBHOOK_SECRET: z.string().optional(),
  TURNSTILE_SECRET: z.string().optional(),
});

export type AgentModel = Readonly<{provider: string; modelId: string}>;

export function parseAgentModel(model: string): AgentModel {
  const separator = model.indexOf(":");
  if (separator <= 0 || separator !== model.lastIndexOf(":") || separator === model.length - 1) {
    throw new Error("AGENT_MODEL_INVALID");
  }

  return {
    provider: model.slice(0, separator),
    modelId: model.slice(separator + 1),
  };
}

function validateServerEnvironment(environment: Environment): void {
  if (environment.NODE_ENV !== "production") return;

  const previewTestEmail =
    environment.VERCEL_ENV === "preview"
    && environment.EMAIL_DELIVERY_MODE === "test";
  const missing = serverKeys
    .filter(([key]) =>
      !previewTestEmail
      || (key !== "RESEND_API_KEY" && key !== "EMAIL_FROM"),
    )
    .filter(([key]) => valueFor(environment, key).trim().length === 0)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

export function parseServerEnv(environment: Environment = process.env): ServerEnv {
  validateServerEnvironment(environment);

  const ai = aiEnvironmentSchema.parse(environment);
  parseAgentModel(ai.AGENT_MODEL_CONCIERGE);

  return {
    databaseUrl: valueFor(environment, "DATABASE_URL"),
    neonAuthBaseUrl: valueFor(environment, "NEON_AUTH_BASE_URL"),
    neonAuthCookieSecret: valueFor(environment, "NEON_AUTH_COOKIE_SECRET"),
    stripeSecretKey: valueFor(environment, "STRIPE_SECRET_KEY"),
    stripeWebhookSecret: valueFor(environment, "STRIPE_WEBHOOK_SECRET"),
    stripeStartupPriceId: valueFor(environment, "STRIPE_STARTUP_PRICE_ID"),
    stripeCorporatePriceId: valueFor(environment, "STRIPE_CORPORATE_PRICE_ID"),
    resendApiKey: valueFor(environment, "RESEND_API_KEY"),
    emailFrom: valueFor(environment, "EMAIL_FROM"),
    emailDeliveryMode:
      valueFor(environment, "EMAIL_DELIVERY_MODE") === "test"
        ? "test"
        : "resend",
    cronSecret: valueFor(environment, "CRON_SECRET"),
    appUrl: valueFor(environment, "APP_URL"),
    agentsEnabled: ai.AGENTS_ENABLED,
    agentModelConcierge: ai.AGENT_MODEL_CONCIERGE,
    ...(ai.OPENAI_API_KEY === undefined ? {} : {openaiApiKey: ai.OPENAI_API_KEY}),
    ...(ai.ANTHROPIC_API_KEY === undefined ? {} : {anthropicApiKey: ai.ANTHROPIC_API_KEY}),
    ...(ai.CONCIERGE_COOKIE_SECRET === undefined ? {} : {conciergeCookieSecret: ai.CONCIERGE_COOKIE_SECRET}),
    ...(ai.WOZTELL_API_TOKEN === undefined ? {} : {woztellApiToken: ai.WOZTELL_API_TOKEN}),
    ...(ai.WOZTELL_CHANNEL_ID === undefined ? {} : {woztellChannelId: ai.WOZTELL_CHANNEL_ID}),
    ...(ai.WOZTELL_WEBHOOK_SECRET === undefined ? {} : {woztellWebhookSecret: ai.WOZTELL_WEBHOOK_SECRET}),
    ...(ai.TURNSTILE_SECRET === undefined ? {} : {turnstileSecret: ai.TURNSTILE_SECRET}),
  };
}

export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export function publicEnv(environment: Environment = process.env): PublicEnv {
  return {
    siteUrl: valueFor(environment, "NEXT_PUBLIC_SITE_URL") || "http://localhost:3000",
  };
}
