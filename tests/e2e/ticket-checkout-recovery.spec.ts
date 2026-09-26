import {readFileSync} from "node:fs";
import {expect, test} from "@playwright/test";
import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

const missing = missingM2LiveEnvironment();
const bundle = (locale: "en" | "zh-HK") => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as {
  Admin: {eventsMgmt: {create: string; createSuccess: string}};
  Ticket: {seatCount: string; buyerName: string; buyerEmail: string; submit: string; recoveryTitle: string; recoveryResume: string};
};

for (const {locale, prefix} of [{locale: "en" as const, prefix: ""}, {locale: "zh-HK" as const, prefix: "/zh"}]) {
  test(`${locale}: seat count, same-browser checkout recovery and owner boundary`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires isolated M2 DB/auth/Stripe test mode: ${missing.join(", ")}`);
    const labels = bundle(locale);
    const slug = `audit-recovery-${locale.toLowerCase()}-${Date.now()}`;
    const title = `Recovery walk ${slug}`;
    const staffContext = await browser.newContext();
    const staff = await staffContext.newPage();
    await signInForM2(staff, "staff");
    await staff.goto(`${prefix}/admin/events-mgmt`);
    const form = staff.locator("form:has(input[name=slug])").first();
    await form.locator("input[name=slug]").fill(slug);
    await form.locator("input[name=titleEn]").fill(title);
    await form.locator("textarea[name=descriptionEn]").fill("Isolated checkout recovery acceptance event.");
    await form.locator("input[name=startsAt]").fill("2030-03-01T10:00");
    await form.locator("input[name=capacity]").fill("20");
    await form.locator("select[name=registrationMode]").selectOption("ticketed");
    await form.locator("input[name=ticketPriceHkdCents]").fill("250");
    await form.locator("select[name=visibility]").selectOption("public");
    await form.locator("input[name=published]").check();
    await form.getByRole("button", {name: labels.Admin.eventsMgmt.create}).click();
    await expect(form.getByRole("status")).toHaveText(labels.Admin.eventsMgmt.createSuccess);

    const buyerContext = await browser.newContext();
    const buyer = await buyerContext.newPage();
    await signInForM2(buyer, "member");
    await buyer.goto(`${prefix}/events/${slug}`);
    await expect(buyer.getByRole("heading", {name: title})).toBeVisible();
    const checkout = buyer.locator("form:has(select[name=quantity])");
    await expect(checkout.getByRole("button", {name: labels.Ticket.submit})).toBeEnabled();
    await checkout.getByLabel(labels.Ticket.seatCount).selectOption("3");
    await expect(checkout.locator('input[name^="seatName-"]')).toHaveCount(3);
    await expect(checkout).toContainText("750");
    await checkout.locator('input[name="buyerName"]').fill("Ada Lovelace");
    await checkout.locator('input[name="buyerEmail"]').fill("ada@example.test");
    await checkout.locator('input[name="seatName-0"]').fill("Ada Lovelace");
    await checkout.locator('input[name="seatEmail-0"]').fill("ada@example.test");
    await checkout.getByRole("button", {name: labels.Ticket.submit}).click();
    await expect(checkout.getByRole("alert").first()).toBeVisible();
    await expect(buyer).toHaveURL(new RegExp(`/events/${slug}`));
    await checkout.getByLabel(labels.Ticket.seatCount).selectOption("10");
    await expect(checkout.locator('input[name^="seatName-"]')).toHaveCount(10);
    await expect(checkout).toContainText("2,500");
    await checkout.getByLabel(labels.Ticket.seatCount).selectOption("1");
    await Promise.all([buyer.waitForURL(/checkout\.stripe\.com/), checkout.getByRole("button", {name: labels.Ticket.submit}).click()]);
    const originalCheckoutUrl = buyer.url();
    const recoveryCookie = (await buyerContext.cookies()).find((cookie) => cookie.name === "hkwtia_ticket_checkout_recovery");
    expect(recoveryCookie).toBeTruthy();
    expect(recoveryCookie?.httpOnly).toBe(true);
    await buyer.goto(`${prefix}/events/${slug}?ticket=cancelled`);
    await expect(buyer.getByText(labels.Ticket.recoveryTitle)).toBeVisible();
    await expect(buyer.getByRole("button", {name: labels.Ticket.submit})).toHaveCount(0);
    await buyer.reload();
    await expect(buyer.getByRole("button", {name: labels.Ticket.recoveryResume})).toBeVisible();
    await staffContext.addCookies([recoveryCookie!]);
    const denied = await staff.request.get(`/api/events/checkout-recovery?eventId=${await buyer.locator('input[name="eventId"]').first().inputValue()}`);
    expect(denied.status()).toBe(404);
    await Promise.all([buyer.waitForURL(/checkout\.stripe\.com/), buyer.getByRole("button", {name: labels.Ticket.recoveryResume}).click()]);
    expect(buyer.url()).toBe(originalCheckoutUrl);
    await buyerContext.close();
    await staffContext.close();
  });
}
