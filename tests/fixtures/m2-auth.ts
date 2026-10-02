import {createHash} from "node:crypto";
import {mkdirSync, readFileSync} from "node:fs";
import {resolve} from "node:path";

import {expect, type Cookie, type Page} from "@playwright/test";

import {M2_LIVE_ENV_NAMES, missingM2IdentityEnvironment, missingM2LiveEnvironment} from "@/tests/fixtures/m2-runtime-env";

import {reuseM2Session} from "./m2-session-reuse";

export {M2_LIVE_ENV_NAMES, missingM2IdentityEnvironment, missingM2LiveEnvironment};

export type TestRole = "staff" | "member" | "company-admin" | "exco" | "superadmin";

export async function signInForM2(page: Page, role: TestRole): Promise<void> {
  const prefix = {staff: "M2_TEST_STAFF", member: "M2_TEST_MEMBER", "company-admin": "M2_TEST_COMPANY_ADMIN", exco: "M2_TEST_EXCO", superadmin: "M2_TEST_SUPERADMIN"}[role];
  const email = process.env[prefix + "_EMAIL"]?.trim();
  const password = process.env[prefix + "_PASSWORD"]?.trim();
  if (!email || !password) throw new Error(prefix + "_EMAIL and " + prefix + "_PASSWORD are required");

  const callbackURL = ["staff", "exco", "superadmin"].includes(role) ? "/admin" : "/portal";
  await page.goto("/");
  // Repeated isolated suites share the provider's sign-in limiter. A cached
  // artifact is usable only after Auth confirms the same identity server-side.
  const directory = resolve(process.cwd(), "test-results", "m2-auth");
  mkdirSync(directory, {recursive: true});
  const scope = createHash("sha256").update(new URL(page.url()).origin + "|" + (process.env.NEON_AUTH_BASE_URL ?? "") + "|" + role).digest("hex");
  const statePath = resolve(directory, scope + ".json");
  const protectedPath = role === "member" || role === "company-admin" ? "/portal" : "/admin";
  try {
    const state = JSON.parse(readFileSync(statePath, "utf8")) as {cookies: Cookie[]};
    if (Array.isArray(state.cookies) && await reuseM2Session(page, state.cookies, email!, protectedPath)) return;
  } catch { /* Missing, expired or malformed state requires a real sign-in. */ }
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: {email, password, callbackURL},
    headers: {Origin: new URL(page.url()).origin},
  });
  expect(response.ok()).toBe(true);

  expect((await page.request.get(protectedPath, {maxRedirects: 0})).ok()).toBe(true);
  await page.context().storageState({path: statePath});
}