import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = [...missingM2LiveEnvironment()];
const membershipId = process.env.HKWTIA_TEST_PENDING_MEMBERSHIP_ID?.trim() ?? "";
if (!membershipId) missing.push("HKWTIA_TEST_PENDING_MEMBERSHIP_ID");
if (!process.env.PLAYWRIGHT_BASE_URL?.trim()) missing.push("PLAYWRIGHT_BASE_URL (isolated non-Production Preview)");
if (/hkwtia\.vercel\.app|production/i.test(process.env.PLAYWRIGHT_BASE_URL ?? "")) missing.push("non-Production PLAYWRIGHT_BASE_URL");
const bundle = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
  Join: {checkoutSummary: {title: string; continuePayment: string; later: string; stillProcessing: string}};
};

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: cancellation returns to summary, status stays owner-scoped, same attempt resumes`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires isolated member, DB and Stripe test mode: ${missing.join(", ")}`);
    const labels = bundle(locale).Join.checkoutSummary;
    const memberContext = await browser.newContext();
    const member = await memberContext.newPage();
    await signInForM2(member, "member");
    const localSummary = `${prefix}/join/checkout?membership_id=${membershipId}`;
    await member.goto(localSummary);
    await expect(member.getByRole("heading", {name: labels.title})).toBeVisible();
    await expect(member.getByRole("button", {name: labels.continuePayment})).toBeVisible();
    const statusUrl = `/api/membership/checkout-status?membershipId=${membershipId}`;
    const pending = await member.request.get(statusUrl);
    expect(pending.status()).toBe(200);
    expect(pending.headers()["cache-control"]).toBe("private, no-store");
    expect(await pending.json()).toEqual({status: "processing"});
    const staffContext = await browser.newContext();
    const staff = await staffContext.newPage();
    await signInForM2(staff, "staff");
    expect((await staff.request.get(statusUrl)).status()).toBe(404);
    await staffContext.close();
    await Promise.all([member.waitForURL(/checkout\.stripe\.com/, {waitUntil: "commit"}), member.getByRole("button", {name: labels.continuePayment}).click()]);
    const firstSession = member.url();
    await member.goto(localSummary); // The configured Stripe cancelUrl returns here.
    await expect(member.getByRole("heading", {name: labels.title})).toBeVisible();
    await expect(member.getByRole("link", {name: labels.later})).toBeVisible();
    await Promise.all([member.waitForURL(/checkout\.stripe\.com/, {waitUntil: "commit"}), member.getByRole("button", {name: labels.continuePayment}).click()]);
    expect(member.url()).toBe(firstSession);
    await member.goto(`${prefix}/join/complete?membership_id=${membershipId}&session_id=forged-success`);
    await expect(member.locator('[data-checkout-status="processing"]')).toBeVisible();
    await expect(member.locator('[data-checkout-status="active"]')).toHaveCount(0);
    await memberContext.close();
  });
}

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: native membership form reaches Stripe before hydration`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires isolated member, DB and Stripe test mode: ${missing.join(", ")}`);
    const signedIn = await browser.newContext();
    await signInForM2(await signedIn.newPage(), "member");
    const native = await browser.newContext({storageState: await signedIn.storageState(), javaScriptEnabled: false});
    await signedIn.close();
    const page = await native.newPage();
    const cspErrors: string[] = [];
    page.on("console", message => {
      if (/form-action/.test(message.text())) cspErrors.push("form-action blocked native checkout redirect");
    });
    await page.goto(`${prefix}/join/checkout?membership_id=${membershipId}`);
    await page.getByRole("button", {name: bundle(locale).Join.checkoutSummary.continuePayment}).click();
    await expect.poll(() => new URL(page.url()).origin, {message: cspErrors.join("; ") || "native form must reach trusted Stripe origin"})
      .toBe("https://checkout.stripe.com");
    expect(cspErrors).toEqual([]);
    await native.close();
  });
}
