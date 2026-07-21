import {mkdirSync} from "node:fs";
import {resolve} from "node:path";

import {expect, type Page} from "@playwright/test";

export const M2_LIVE_ENV_NAMES = [
  "DATABASE_URL_TEST",
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_COOKIE_SECRET",
  "M2_TEST_STAFF_EMAIL",
  "M2_TEST_STAFF_PASSWORD",
  "M2_TEST_MEMBER_EMAIL",
  "M2_TEST_MEMBER_PASSWORD",
] as const;

export type TestRole = "staff" | "member";

export function missingM2LiveEnvironment(environment: NodeJS.ProcessEnv = process.env): readonly string[] {
  return M2_LIVE_ENV_NAMES.filter((name) => !environment[name]?.trim());
}

export async function signInForM2(page: Page, role: TestRole): Promise<void> {
  const prefix = role === "staff" ? "M2_TEST_STAFF" : "M2_TEST_MEMBER";
  const email = process.env[`${prefix}_EMAIL`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`]?.trim();
  if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD are required`);

  const callbackURL = role === "staff" ? "/admin" : "/portal";
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: {email, password, callbackURL},
  });
  expect(response.ok()).toBe(true);

  const directory = resolve(process.cwd(), "test-results", "m2-auth");
  mkdirSync(directory, {recursive: true});
  await page.context().storageState({path: resolve(directory, `${role}.json`)});
}