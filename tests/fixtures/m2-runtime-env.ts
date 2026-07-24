export const M2_LIVE_ENV_NAMES = [
  "DATABASE_URL_TEST",
  "M2_TEST_NEON_PROJECT_ID",
  "M2_TEST_NEON_HOST",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "STRIPE_TEST_SECRET_KEY",
  "STRIPE_TEST_WEBHOOK_SECRET",
  "STRIPE_TEST_STARTUP_PRICE_ID",
  "STRIPE_TEST_CORPORATE_PRICE_ID",
  "APP_URL",
  "M2_TEST_STAFF_EMAIL",
  "M2_TEST_STAFF_PASSWORD",
  "M2_TEST_MEMBER_EMAIL",
  "M2_TEST_MEMBER_PASSWORD",
  "M2_TEST_COMPANY_ADMIN_EMAIL",
  "M2_TEST_COMPANY_ADMIN_PASSWORD",
] as const;

type RuntimeEnvironment = NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;

export function missingM2LiveEnvironment(environment: RuntimeEnvironment = process.env): readonly string[] {
  return M2_LIVE_ENV_NAMES.filter((name) => !environment[name]?.trim());
}

export function buildM2RuntimeEnvironment(environment: RuntimeEnvironment = process.env): Record<string, string> {
  const definedEnvironment = Object.fromEntries(Object.entries(environment).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  return {
    ...definedEnvironment,
    DATABASE_URL: environment.DATABASE_URL_TEST?.trim() ?? "",
    STRIPE_SECRET_KEY: environment.STRIPE_TEST_SECRET_KEY?.trim() ?? "",
    STRIPE_WEBHOOK_SECRET: environment.STRIPE_TEST_WEBHOOK_SECRET?.trim() ?? "",
    STRIPE_STARTUP_PRICE_ID: environment.STRIPE_TEST_STARTUP_PRICE_ID?.trim() ?? "",
    STRIPE_CORPORATE_PRICE_ID: environment.STRIPE_TEST_CORPORATE_PRICE_ID?.trim() ?? "",
    APP_URL: environment.APP_URL?.trim() ?? "",
  };
}
