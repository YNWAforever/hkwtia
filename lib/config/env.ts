import "server-only";

import {z} from "zod";

import {parseAgentModel} from "@/lib/ai/model";

export {parseAgentModel};
export type {AgentModel} from "@/lib/ai/model";

export interface DatabaseEnv {
  databaseUrl: string;
}

export interface AuthEnv {
  neonAuthBaseUrl: string;
  neonAuthCookieSecret: string;
}

export interface AppEnv {
  appUrl: string;
}

export interface EmailEnv {
  resendApiKey: string;
  emailFrom: string;
  emailDeliveryMode: "resend" | "test";
}

export interface BillingEnv {
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeStartupPriceId: string;
  stripeCorporatePriceId: string;
}

export interface AutomationEnv {
  cronSecret: string;
}

export interface UnsubscribeEnv {
  unsubscribeTokenSecret: string;
}

export interface AiEnv {
  agentsEnabled: boolean;
  agentModelConcierge: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
  conciergeCookieSecret?: string;
  woztellApiToken?: string;
  woztellChannelId?: string;
  woztellWebhookSecret?: string;
  /**
   * Programme C-3. Configuration for the conversation-history backfill, and
   * deliberately NOT in `serverKeys`: the backfill is an admin-triggered import,
   * not a boot requirement, and boundary 7 exists because a transitive env pull
   * once took `/sitemap.xml`, `/events`, `/showcase` and `/launchpad` down. The
   * route answers 503 BACKFILL_NOT_CONFIGURED when it is blank rather than
   * refusing to start the process.
   */
  woztellOpenApiToken?: string;
  /**
   * Programme C-9 (C1 open question O-8). The switch that decides whether a real
   * WhatsApp message leaves the building.
   *
   * It and `woztellApprovedTemplateKeys` were the last two variables read from
   * bare `process.env`, outside boundary 7 — no Zod parse and no owner — and
   * this one fails in the worst available direction: `RUN_LIVE_WOZTELL=true`
   * finds no live credentials, so every send returns
   * `{status: "sent", providerId: "mock:…"}` and journey, dunning and blast
   * messages are recorded as delivered while nothing is sent
   * (`lib/jobs/runners.ts:421-427` is that incident). Parsed as `"0" | "1"`, a
   * typo is a startup error instead of a silent downgrade.
   *
   * Deliberately NOT in `serverKeys`: it is optional everywhere, and a hard boot
   * requirement there is how a transitive env pull once took `/sitemap.xml`,
   * `/events`, `/showcase` and `/launchpad` down. A blank value — which
   * `.env.example` ships and Vercel produces for an empty variable — reads as
   * absent, exactly as it did before this contract existed.
   */
  runLiveWoztell?: "0" | "1";
  /**
   * Programme C-9 (O-8). The operator allowlist that `whatsapp_templates`
   * replaced, kept as the fallback for one condition only: a registry with no
   * rows at all, which is what a half-run migration or a database restored
   * without 0034 looks like (S-14).
   *
   * Declared here so the variable has an owner and a parse. Its single reader,
   * `lib/whatsapp/approved-templates.ts`, deliberately takes its environment by
   * injection rather than calling `aiEnv()`: `/admin/templates` imports it, and
   * `parseAiEnvironment` requires `CONCIERGE_COOKIE_SECRET` in production — so
   * reading the contract from there would put a boot requirement on a page that
   * sends nothing, which is the boundary-7 coupling above.
   */
  woztellApprovedTemplateKeys?: string;
  turnstileSecret?: string;
  turnstileSiteKey?: string;
}

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
  unsubscribeTokenSecret: string;
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
  turnstileSiteKey?: string;
}

export interface PublicEnv {
  siteUrl: string;
  /**
   * A Turnstile site key is public by design. It is read here rather than
   * through serverEnv so statically prerendered public pages can render the
   * widget without the strict production credential check.
   */
  turnstileSiteKey?: string;
}

type Environment = Partial<NodeJS.ProcessEnv>;

const serverKeys = [
  ["DATABASE_URL", "databaseUrl"],
  ["NEON_AUTH_BASE_URL", "neonAuthBaseUrl"],
  ["NEON_AUTH_COOKIE_SECRET", "neonAuthCookieSecret"],
  ["CONCIERGE_COOKIE_SECRET", "conciergeCookieSecret"],
  ["STRIPE_SECRET_KEY", "stripeSecretKey"],
  ["STRIPE_WEBHOOK_SECRET", "stripeWebhookSecret"],
  ["STRIPE_STARTUP_PRICE_ID", "stripeStartupPriceId"],
  ["STRIPE_CORPORATE_PRICE_ID", "stripeCorporatePriceId"],
  ["RESEND_API_KEY", "resendApiKey"],
  ["EMAIL_FROM", "emailFrom"],
  ["CRON_SECRET", "cronSecret"],
  ["UNSUBSCRIBE_TOKEN_SECRET", "unsubscribeTokenSecret"],
  ["APP_URL", "appUrl"],
] as const;

function valueFor(environment: Environment, key: string): string {
  return environment[key] ?? "";
}

function requireProductionKeys(
  environment: Environment,
  keys: readonly string[],
): void {
  if (environment.NODE_ENV !== "production") return;

  const missing = keys.filter((key) => valueFor(environment, key).trim().length === 0);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

/**
 * The live-send switch, parsed in ONE place (C-9 O-8, and the C-9 review).
 *
 * Strict, and blank-tolerant on purpose: `.env.example` ships
 * `RUN_LIVE_WOZTELL=` and an empty Vercel variable arrives as `""`, so a blank
 * must keep meaning "not live" — while `true`, `yes` or `TRUE` must stop meaning
 * it silently, because that typo used to find no live credentials and record
 * every send as delivered with a `mock:` provider id.
 *
 * Exported because `lib/whatsapp/approved-templates.ts` decides "are we live?"
 * for `/admin/templates` and the campaign wizard and deliberately cannot call
 * `aiEnv()` — that would put `CONCIERGE_COOKIE_SECRET` on a page that sends
 * nothing, which is the boundary-7 coupling that once took `/sitemap.xml` down.
 * It reads the same schema instead, so the flip has one parse and not two: two
 * parses of one switch is how a value that means "live" over here comes to mean
 * "mock" over there.
 */
export const runLiveWoztellSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length === 0 ? undefined : value),
  z.enum(["0", "1"]).optional(),
);

const aiEnvironmentSchema = z.object({
  AGENTS_ENABLED: z.string().optional().transform((value) => value === "true"),
  AGENT_MODEL_CONCIERGE: z.string().default("openai:gpt-4.1-mini"),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  CONCIERGE_COOKIE_SECRET: z.string().refine(
    (value) => Buffer.byteLength(value, "utf8") >= 32,
    {message: "CONCIERGE_COOKIE_SECRET must be at least 32 bytes"},
  ).optional(),
  WOZTELL_API_TOKEN: z.string().optional(),
  WOZTELL_CHANNEL_ID: z.string().optional(),
  WOZTELL_WEBHOOK_SECRET: z.string().optional(),
  WOZTELL_OPEN_API_TOKEN: z.string().optional(),
  RUN_LIVE_WOZTELL: runLiveWoztellSchema,
  WOZTELL_APPROVED_TEMPLATE_KEYS: z.string().optional(),
  TURNSTILE_SECRET: z.string().refine(
    (value) => value.trim().length > 0,
    {message: "TURNSTILE_SECRET must not be blank"},
  ).optional(),
  TURNSTILE_SITE_KEY: z.string().refine(
    (value) => value.trim().length > 0,
    {message: "TURNSTILE_SITE_KEY must not be blank"},
  ).optional(),
});

function parseAiEnvironment(environment: Environment): AiEnv {
  const ai = aiEnvironmentSchema.parse(environment);
  parseAgentModel(ai.AGENT_MODEL_CONCIERGE);

  if (environment.NODE_ENV === "production") {
    const conciergeSecret = valueFor(environment, "CONCIERGE_COOKIE_SECRET");
    requireProductionKeys(environment, ["CONCIERGE_COOKIE_SECRET"]);
    if (Buffer.byteLength(conciergeSecret, "utf8") < 32) {
      throw new Error("CONCIERGE_COOKIE_SECRET must be at least 32 bytes");
    }
    if (conciergeSecret === valueFor(environment, "NEON_AUTH_COOKIE_SECRET")) {
      throw new Error("CONCIERGE_COOKIE_SECRET must not reuse NEON_AUTH_COOKIE_SECRET");
    }
  }

  return {
    agentsEnabled: ai.AGENTS_ENABLED,
    agentModelConcierge: ai.AGENT_MODEL_CONCIERGE,
    ...(ai.OPENAI_API_KEY === undefined ? {} : {openaiApiKey: ai.OPENAI_API_KEY}),
    ...(ai.ANTHROPIC_API_KEY === undefined ? {} : {anthropicApiKey: ai.ANTHROPIC_API_KEY}),
    ...(ai.CONCIERGE_COOKIE_SECRET === undefined ? {} : {conciergeCookieSecret: ai.CONCIERGE_COOKIE_SECRET}),
    ...(ai.WOZTELL_API_TOKEN === undefined ? {} : {woztellApiToken: ai.WOZTELL_API_TOKEN}),
    ...(ai.WOZTELL_CHANNEL_ID === undefined ? {} : {woztellChannelId: ai.WOZTELL_CHANNEL_ID}),
    ...(ai.WOZTELL_WEBHOOK_SECRET === undefined ? {} : {woztellWebhookSecret: ai.WOZTELL_WEBHOOK_SECRET}),
    ...(ai.WOZTELL_OPEN_API_TOKEN === undefined ? {} : {woztellOpenApiToken: ai.WOZTELL_OPEN_API_TOKEN}),
    ...(ai.RUN_LIVE_WOZTELL === undefined ? {} : {runLiveWoztell: ai.RUN_LIVE_WOZTELL}),
    ...(ai.WOZTELL_APPROVED_TEMPLATE_KEYS === undefined
      ? {}
      : {woztellApprovedTemplateKeys: ai.WOZTELL_APPROVED_TEMPLATE_KEYS}),
    ...(ai.TURNSTILE_SECRET === undefined ? {} : {turnstileSecret: ai.TURNSTILE_SECRET}),
    ...(ai.TURNSTILE_SITE_KEY === undefined ? {} : {turnstileSiteKey: ai.TURNSTILE_SITE_KEY}),
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

  const conciergeSecret = valueFor(environment, "CONCIERGE_COOKIE_SECRET");
  if (Buffer.byteLength(conciergeSecret, "utf8") < 32) {
    throw new Error("CONCIERGE_COOKIE_SECRET must be at least 32 bytes");
  }
  if (conciergeSecret === valueFor(environment, "NEON_AUTH_COOKIE_SECRET")) {
    throw new Error("CONCIERGE_COOKIE_SECRET must not reuse NEON_AUTH_COOKIE_SECRET");
  }

  const unsubscribeSecret = valueFor(environment, "UNSUBSCRIBE_TOKEN_SECRET");
  if (Buffer.byteLength(unsubscribeSecret, "utf8") < 32) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET must be at least 32 bytes");
  }
  if (unsubscribeSecret === valueFor(environment, "CRON_SECRET")) {
    throw new Error("UNSUBSCRIBE_TOKEN_SECRET must not reuse CRON_SECRET");
  }

  const turnstileSecret = valueFor(environment, "TURNSTILE_SECRET").trim();
  const turnstileSiteKey = valueFor(environment, "TURNSTILE_SITE_KEY").trim();
  if (Boolean(turnstileSecret) !== Boolean(turnstileSiteKey)) {
    throw new Error("TURNSTILE_SECRET and TURNSTILE_SITE_KEY must be set together");
  }
  if (!turnstileSecret && environment.VERCEL_ENV !== "preview") {
    throw new Error(
      "Missing required production environment variables: TURNSTILE_SECRET, TURNSTILE_SITE_KEY",
    );
  }
}

export function parseDatabaseEnv(environment: Environment = process.env): DatabaseEnv {
  requireProductionKeys(environment, ["DATABASE_URL"]);

  return {
    databaseUrl: valueFor(environment, "DATABASE_URL"),
  };
}

export function databaseEnv(): DatabaseEnv {
  return parseDatabaseEnv(process.env);
}

export function parseAuthEnv(environment: Environment = process.env): AuthEnv {
  requireProductionKeys(environment, ["NEON_AUTH_BASE_URL", "NEON_AUTH_COOKIE_SECRET"]);

  return {
    neonAuthBaseUrl: valueFor(environment, "NEON_AUTH_BASE_URL"),
    neonAuthCookieSecret: valueFor(environment, "NEON_AUTH_COOKIE_SECRET"),
  };
}

export function authEnv(): AuthEnv {
  return parseAuthEnv(process.env);
}

export function parseAppEnv(environment: Environment = process.env): AppEnv {
  requireProductionKeys(environment, ["APP_URL"]);

  return {
    appUrl: valueFor(environment, "APP_URL"),
  };
}

export function appEnv(): AppEnv {
  return parseAppEnv(process.env);
}

export function parseEmailEnv(environment: Environment = process.env): EmailEnv {
  const previewTestEmail =
    environment.NODE_ENV === "production"
    && environment.VERCEL_ENV === "preview"
    && environment.EMAIL_DELIVERY_MODE === "test";

  if (!previewTestEmail) {
    requireProductionKeys(environment, ["RESEND_API_KEY", "EMAIL_FROM"]);
  }

  return {
    resendApiKey: valueFor(environment, "RESEND_API_KEY"),
    emailFrom: valueFor(environment, "EMAIL_FROM"),
    emailDeliveryMode:
      valueFor(environment, "EMAIL_DELIVERY_MODE") === "test"
        ? "test"
        : "resend",
  };
}

export function emailEnv(): EmailEnv {
  return parseEmailEnv(process.env);
}

export function parseBillingEnv(environment: Environment = process.env): BillingEnv {
  requireProductionKeys(environment, [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_STARTUP_PRICE_ID",
    "STRIPE_CORPORATE_PRICE_ID",
  ]);

  return {
    stripeSecretKey: valueFor(environment, "STRIPE_SECRET_KEY"),
    stripeWebhookSecret: valueFor(environment, "STRIPE_WEBHOOK_SECRET"),
    stripeStartupPriceId: valueFor(environment, "STRIPE_STARTUP_PRICE_ID"),
    stripeCorporatePriceId: valueFor(environment, "STRIPE_CORPORATE_PRICE_ID"),
  };
}

export function billingEnv(): BillingEnv {
  return parseBillingEnv(process.env);
}

export function parseAutomationEnv(environment: Environment = process.env): AutomationEnv {
  requireProductionKeys(environment, ["CRON_SECRET"]);

  return {
    cronSecret: valueFor(environment, "CRON_SECRET"),
  };
}

export function automationEnv(): AutomationEnv {
  return parseAutomationEnv(process.env);
}

// `CRON_SECRET` was required here while unsubscribe links signed with it were
// still being honoured. Now that the fallback is gone, keeping it would make a
// public page fail to boot over a variable it never reads — the transitive
// coupling that once took /sitemap.xml down. `automationEnv().cronSecret` still
// serves the job routes.
export function parseUnsubscribeEnv(environment: Environment = process.env): UnsubscribeEnv {
  requireProductionKeys(environment, ["UNSUBSCRIBE_TOKEN_SECRET"]);

  return {
    unsubscribeTokenSecret: valueFor(environment, "UNSUBSCRIBE_TOKEN_SECRET"),
  };
}

export function unsubscribeEnv(): UnsubscribeEnv {
  return parseUnsubscribeEnv(process.env);
}

export function parseAiEnv(environment: Environment = process.env): AiEnv {
  return parseAiEnvironment(environment);
}

export function aiEnv(): AiEnv {
  return parseAiEnv(process.env);
}

export function parseServerEnv(environment: Environment = process.env): ServerEnv {
  validateServerEnvironment(environment);

  const ai = parseAiEnvironment(environment);

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
    unsubscribeTokenSecret: valueFor(environment, "UNSUBSCRIBE_TOKEN_SECRET"),
    appUrl: valueFor(environment, "APP_URL"),
    agentsEnabled: ai.agentsEnabled,
    agentModelConcierge: ai.agentModelConcierge,
    ...(ai.openaiApiKey === undefined ? {} : {openaiApiKey: ai.openaiApiKey}),
    ...(ai.anthropicApiKey === undefined ? {} : {anthropicApiKey: ai.anthropicApiKey}),
    ...(ai.conciergeCookieSecret === undefined ? {} : {conciergeCookieSecret: ai.conciergeCookieSecret}),
    ...(ai.woztellApiToken === undefined ? {} : {woztellApiToken: ai.woztellApiToken}),
    ...(ai.woztellChannelId === undefined ? {} : {woztellChannelId: ai.woztellChannelId}),
    ...(ai.woztellWebhookSecret === undefined ? {} : {woztellWebhookSecret: ai.woztellWebhookSecret}),
    ...(ai.turnstileSecret === undefined ? {} : {turnstileSecret: ai.turnstileSecret}),
    ...(ai.turnstileSiteKey === undefined ? {} : {turnstileSiteKey: ai.turnstileSiteKey}),
  };
}

export function serverEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export function publicEnv(environment: Environment = process.env): PublicEnv {
  const turnstileSiteKey = valueFor(environment, "TURNSTILE_SITE_KEY").trim();
  return {
    siteUrl: valueFor(environment, "NEXT_PUBLIC_SITE_URL") || "http://localhost:3000",
    ...(turnstileSiteKey ? {turnstileSiteKey} : {}),
  };
}
