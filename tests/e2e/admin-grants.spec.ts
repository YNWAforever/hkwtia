import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {expect, test} from "@playwright/test";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";
const en = JSON.parse(readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8")) as typeof import("../../messages/en.json");
const zh = JSON.parse(readFileSync(new URL("../../messages/zh-HK.json", import.meta.url), "utf8")) as typeof import("../../messages/zh-HK.json");
const execute = promisify(execFile);
async function driver(mode: string, run: string) {
  const {stdout} = await execute(process.execPath, ["--import", "tsx", "tests/fixtures/audit-grant-driver.ts", mode, run], {timeout: 60000});
  return JSON.parse(stdout) as {profileId: string; grants: {plan_code: string; status: string; grant_effective_at: string; grant_expires_at: string; grant_reason: string; grant_actor_profile_id: string; billing_period_end: string | null}[]; audits: number};
}
for (const [locale, prefix, messages] of [["en", "", en], ["zh-HK", "/zh", zh]] as const) {
  test(`${locale}: only superadmin grants a finite membership and duplicate submission preserves one grant`, async ({browser, baseURL}) => {
    test.setTimeout(420_000); // Five real identity sessions plus isolated database assertions.
    const roleNames = ["M2_TEST_EXCO_EMAIL", "M2_TEST_EXCO_PASSWORD", "M2_TEST_SUPERADMIN_EMAIL", "M2_TEST_SUPERADMIN_PASSWORD"];
    test.skip(missingM2IdentityEnvironment().length > 0 || roleNames.some(name => !process.env[name]?.trim()) || process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true" || process.env.MEMBERSHIP_GRANTS_ENABLED !== "true", "Requires isolated five-role identities and finite grant flag");
    expect(new URL(baseURL!).hostname).not.toBe("hkwtia.vercel.app");
    const run = randomUUID(), fixture = await driver("seed", run), labels = messages.Admin.membershipGrant;
    const path = `${prefix}/admin/members/${fixture.profileId}`;
    for (const role of ["anonymous", "member", "staff", "exco", "superadmin"] as const) {
      const context = await browser.newContext({baseURL}), page = await context.newPage();
      try {
        if (role !== "anonymous") await signInForM2(page, role);
        const response = await page.goto(path);
        if (role === "anonymous") {expect(response?.status()).toBe(200); expect(new URL(page.url()).pathname).toBe(`${prefix}/admin-login`); await expect(page.locator('form:has(input[name="expiresAt"])')).toHaveCount(0);}
        else if (role === "member") {expect(response?.status()).toBe(200); expect(new URL(page.url()).pathname).toBe(`${prefix}/admin-login`); await expect(page.getByRole("heading", {level: 1, name: messages.AdminLogin.accessDenied, exact: true})).toBeVisible(); await expect(page.locator('form:has(input[name="expiresAt"])')).toHaveCount(0);}
        else if (role !== "superadmin") {expect(response?.status()).toBe(200); await expect(page.locator('form:has(input[name="expiresAt"])')).toHaveCount(0);}
        else {
          const form = page.locator('form:has(input[name="expiresAt"])');
          await form.locator('select[name="planCode"]').selectOption("startup");
          await form.locator('input[name="effectiveAt"]').fill("2030-01-01T09:00");
          await form.locator('input[name="expiresAt"]').fill("2030-01-31T09:00");
          await form.locator('textarea[name="reason"]').fill("Synthetic isolated finite grant acceptance");
          await form.getByRole("button", {name: labels.submit, exact: true}).click();
          await expect(form.getByRole("status")).toHaveText(labels.success);
          // React resets an uncontrolled successful action form; submit the same values again.
          await form.locator('select[name="planCode"]').selectOption("startup");
          await form.locator('input[name="effectiveAt"]').fill("2030-01-01T09:00");
          await form.locator('input[name="expiresAt"]').fill("2030-01-31T09:00");
          await form.locator('textarea[name="reason"]').fill("Synthetic isolated finite grant acceptance");
          await form.getByRole("button", {name: labels.submit, exact: true}).click();
          await expect(form.getByRole("alert")).toHaveText(labels.duplicate);
        }
        const facts = await driver("facts", run);
        expect(facts.grants).toHaveLength(role === "superadmin" ? 1 : 0);
        expect(facts.audits).toBe(role === "superadmin" ? 1 : 0);
        if (role === "superadmin") expect(facts.grants[0]).toMatchObject({plan_code: "startup", status: "active", grant_effective_at: "2030-01-01T01:00:00.000Z", grant_expires_at: "2030-01-31T01:00:00.000Z", grant_actor_profile_id: "m2-superadmin-01", billing_period_end: null});
      } finally {await context.close();}
    }
  });
}
