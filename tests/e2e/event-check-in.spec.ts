import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = [...missingM2LiveEnvironment()];
const eventId = process.env.HKWTIA_TEST_GUEST_CHECKIN_EVENT_ID?.trim() ?? "";
const guestEmail = process.env.HKWTIA_TEST_GUEST_CHECKIN_EMAIL?.trim() ?? "";
if (!eventId) missing.push("HKWTIA_TEST_GUEST_CHECKIN_EVENT_ID");
if (!guestEmail) missing.push("HKWTIA_TEST_GUEST_CHECKIN_EMAIL");
if (!process.env.PLAYWRIGHT_BASE_URL?.trim()) missing.push("PLAYWRIGHT_BASE_URL (isolated non-Production Preview)");
if (/hkwtia\.vercel\.app|production/i.test(process.env.PLAYWRIGHT_BASE_URL ?? "")) missing.push("non-Production PLAYWRIGHT_BASE_URL");
const bundle = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
  Admin: {eventsMgmt: {attendeeSearch: string; checkIn: string; checkInSuccess: string}};
};

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: staff finds and checks in a confirmed guest at 390px`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires isolated staff, DB, fresh guest and Preview: ${missing.join(", ")}`);
    const labels = bundle(locale).Admin.eventsMgmt;
    const context = await browser.newContext({viewport: {width: 390, height: 844}});
    const page = await context.newPage();
    await signInForM2(page, "staff");
    await page.goto(`${prefix}/admin/events-mgmt/${eventId}`);
    await page.getByRole("searchbox", {name: labels.attendeeSearch}).fill(guestEmail);
    const row = page.getByRole("row").filter({hasText: guestEmail});
    await expect(row).toHaveCount(1);
    await row.getByRole("button", {name: labels.checkIn}).click();
    await expect(row.getByRole("status")).toContainText(labels.checkInSuccess);
    await page.reload();
    await page.getByRole("searchbox", {name: labels.attendeeSearch}).fill(guestEmail);
    await expect(page.getByRole("row").filter({hasText: guestEmail}).getByRole("button", {name: labels.checkIn})).toBeDisabled();
    await context.close();
  });
}
