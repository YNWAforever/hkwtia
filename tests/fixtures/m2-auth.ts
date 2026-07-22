import {mkdirSync} from "node:fs";
import {resolve} from "node:path";

import {expect, type Page} from "@playwright/test";

import {M2_LIVE_ENV_NAMES, missingM2LiveEnvironment} from "@/tests/fixtures/m2-runtime-env";

export {M2_LIVE_ENV_NAMES, missingM2LiveEnvironment};

export type TestRole = "staff" | "member" | "company-admin";

export async function signInForM2(page: Page, role: TestRole): Promise<void> {
  const prefix = {staff: "M2_TEST_STAFF", member: "M2_TEST_MEMBER", "company-admin": "M2_TEST_COMPANY_ADMIN"}[role];
  const email = process.env[prefix + "_EMAIL"]?.trim();
  const password = process.env[prefix + "_PASSWORD"]?.trim();
  if (!email || !password) throw new Error(prefix + "_EMAIL and " + prefix + "_PASSWORD are required");

  const callbackURL = role === "staff" ? "/admin" : "/portal";
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: {email, password, callbackURL},
  });
  expect(response.ok()).toBe(true);

  const directory = resolve(process.cwd(), "test-results", "m2-auth");
  mkdirSync(directory, {recursive: true});
  await page.context().storageState({path: resolve(directory, role + ".json")});
}