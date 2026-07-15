import "server-only";

export interface ServerEnv {
  databaseUrl: string;
  neonAuthBaseUrl: string;
  neonAuthCookieSecret: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  stripeStartupPriceId: string;
  stripeCorporatePriceId: string;
  appUrl: string;
}

export interface PublicEnv {
  siteUrl: string;
}

type Environment = NodeJS.ProcessEnv;

const serverKeys = [
  ["DATABASE_URL", "databaseUrl"],
  ["NEON_AUTH_BASE_URL", "neonAuthBaseUrl"],
  ["NEON_AUTH_COOKIE_SECRET", "neonAuthCookieSecret"],
  ["STRIPE_SECRET_KEY", "stripeSecretKey"],
  ["STRIPE_WEBHOOK_SECRET", "stripeWebhookSecret"],
  ["STRIPE_STARTUP_PRICE_ID", "stripeStartupPriceId"],
  ["STRIPE_CORPORATE_PRICE_ID", "stripeCorporatePriceId"],
  ["APP_URL", "appUrl"],
] as const;

function valueFor(environment: Environment, key: string): string {
  return environment[key] ?? "";
}

function validateServerEnvironment(environment: Environment): void {
  if (environment.NODE_ENV !== "production") return;

  const missing = serverKeys
    .filter(([key]) => valueFor(environment, key).trim().length === 0)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
  }
}

export function parseServerEnv(environment: Environment = process.env): ServerEnv {
  validateServerEnvironment(environment);

  return {
    databaseUrl: valueFor(environment, "DATABASE_URL"),
    neonAuthBaseUrl: valueFor(environment, "NEON_AUTH_BASE_URL"),
    neonAuthCookieSecret: valueFor(environment, "NEON_AUTH_COOKIE_SECRET"),
    stripeSecretKey: valueFor(environment, "STRIPE_SECRET_KEY"),
    stripeWebhookSecret: valueFor(environment, "STRIPE_WEBHOOK_SECRET"),
    stripeStartupPriceId: valueFor(environment, "STRIPE_STARTUP_PRICE_ID"),
    stripeCorporatePriceId: valueFor(environment, "STRIPE_CORPORATE_PRICE_ID"),
    appUrl: valueFor(environment, "APP_URL"),
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
