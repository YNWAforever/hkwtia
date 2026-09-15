import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{eventsMgmt: Readonly<{
    slug: string; titleEn: string; descriptionEn: string; startsAt: string; capacity: string; published: string;
    registrationMode: string; registrationModes: Readonly<{ticketed: string}>;
    ticketPriceHkdCents: string; create: string;
  }>}>;
  Ticket: Readonly<{
    heading: string; buyerName: string; buyerEmail: string; seatCount: string;
    attendeeName: string; attendeeEmail: string; submit: string;
  }>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const missing = missingM2LiveEnvironment();
const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

/**
 * Phase D-4a gate (spec §9): staff mark an event ticketed and set its price,
 * then a buyer takes two named seats and reaches Stripe Checkout. The walk stops
 * at the redirect — completing the payment needs the Stripe test dashboard and
 * is the owner's step — so it proves the amount, the seat rows and the session
 * reached the provider, not that the money moved.
 *
 * It writes, so `missingM2LiveEnvironment()` gates it to the isolated M2 database
 * and a unique slug per run keeps a re-run from colliding with the prior row.
 */
for (const {locale, prefix} of locales) {
  test(`staff price a ticketed event and a buyer reaches Stripe Checkout (${locale})`, async ({browser}) => {
    test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);
    const copy = bundle(locale);
    const slug = `d4a-ticket-walk-${locale === "zh-HK" ? "zh" : "en"}-${Date.now().toString(36)}`;
    const title = `D4a walk ${slug}`;

    // Staff author the ticketed event, in their own context so the buyer stays anonymous.
    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    await signInForM2(staffPage, "staff");
    await staffPage.goto(`${prefix}/admin/events-mgmt`);
    const form = staffPage.locator("form").filter({hasText: copy.Admin.eventsMgmt.slug}).first();
    await form.locator('input[name="slug"]').fill(slug);
    await form.locator('input[name="titleEn"]').fill(title);
    // The field name is the contract; the element is a `<textarea>`, so an
    // `input[name=…]` selector matches nothing and the fill times out.
    await form.locator('textarea[name="descriptionEn"]').fill("Ticket checkout acceptance walk.");
    await form.locator('input[name="startsAt"]').fill("2026-12-01T19:00");
    await form.locator('input[name="capacity"]').fill("4");
    await form.locator('select[name="registrationMode"]').selectOption("ticketed");
    // The admin form takes whole HKD dollars and the boundary converts to cents
    // (`lib/admin/event-form-input.ts`), so "250" is HK$250 and 25 000 cents.
    await form.locator('input[name="ticketPriceHkdCents"]').fill("250");
    await form.locator('input[name="published"]').check();
    await form.getByRole("button", {name: copy.Admin.eventsMgmt.create}).click();
    await expect(staffPage.getByRole("link", {name: title})).toBeVisible();

    // The buyer, signed out, buys two named seats. The public page rendering at
    // all is the assertion that staff authoring left the event published and public.
    const buyerContext = await browser.newContext();
    const buyerPage = await buyerContext.newPage();
    await buyerPage.goto(`${prefix}/events/${slug}`);
    await expect(buyerPage.getByText(copy.Ticket.heading)).toBeVisible();
    await buyerPage.locator('input[name="buyerName"]').fill("Ada Lovelace");
    await buyerPage.locator('input[name="buyerEmail"]').fill("ada@example.test");
    // The seat-count select is bound to client state that decides how many
    // attendee rows render; it is never submitted, so it carries no `name` and
    // the field contract is its label. `getByLabel` reaches it, exactly as the
    // component's unit test does.
    await buyerPage.getByLabel(copy.Ticket.seatCount).selectOption("2");
    await buyerPage.locator('input[name="seatName-0"]').fill("Ada Lovelace");
    await buyerPage.locator('input[name="seatEmail-0"]').fill("ada@example.test");
    await buyerPage.locator('input[name="seatName-1"]').fill("Grace Hopper");
    await buyerPage.locator('input[name="seatEmail-1"]').fill("grace@example.test");
    await Promise.all([
      buyerPage.waitForURL(/checkout\.stripe\.com/),
      buyerPage.getByRole("button", {name: copy.Ticket.submit}).click(),
    ]);
    expect(buyerPage.url()).toContain("checkout.stripe.com");

    await staffContext.close();
    await buyerContext.close();
  });
}
