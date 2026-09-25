import {readFileSync} from "node:fs";

import {expect, test, type Page} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{eventsMgmt: Readonly<{cancel: Readonly<{
    heading: string; button: string; keep: string; confirm: string; cancelledNotice: string;
  }>}>}>;
  Events: Readonly<{cancelled: Readonly<{heading: string; body: string; refundPolicy: string}>}>;
  Pass: Readonly<{qrLabel: string; cancelled: Readonly<{heading: string; body: string; refundPolicy: string}>}>;
  Ticket: Readonly<{submit: string}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const en = {locale: "en" as const, prefix: "", publicUrlVar: "D4D_PUBLIC_URL", passUrlVar: "D4D_PASS_URL"};
const zh = {locale: "zh-HK" as const, prefix: "/zh", publicUrlVar: "D4D_PUBLIC_URL_ZH", passUrlVar: "D4D_PASS_URL_ZH"};
const urlVars = [en.publicUrlVar, en.passUrlVar, zh.publicUrlVar, zh.passUrlVar] as const;

// Every missing environment fact is named: a bare "requires acceptance env" can
// never be told apart from a feature that is actually broken.
const missing = [
  ...missingM2LiveEnvironment(),
  // The D-4d fixture is a second event inside `db:seed:d4b`, so it is the same
  // guarded seed and the same flag. It is its own event precisely so this walk
  // does not have to share D-4c's, whose refund makes that order unseedable.
  ...(process.env.D4B_ACCEPTANCE_SEED === "true" ? [] : ["D4B_ACCEPTANCE_SEED=true"]),
  ...urlVars.filter((name) => !process.env[name]?.trim()),
];

// The fixture's four cost figures, matching scripts/seed-d4b.ts's D4D block: two
// paid orders over three seats, 30000 + 15000 cents, and one standing RSVP
// registrant. The confirmation is the price of an irreversible act, so the walk
// asserts the numbers it names are the seeded ones rather than trusting a panel
// that merely rendered.
const SEEDED_COST = {paidOrders: 2, refundTotalHkdCents: 45000, attendees: 3, rsvpRegistrants: 1} as const;

/** The component's own amount formatter (components/admin/cancel-event-panel.tsx). */
const amountLabel = (cents: number, locale: string) =>
  new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}).format(cents / 100);

/**
 * Rebuilds the costed sentence the way the panel does -- from the bundle's
 * template and the seeded figures -- so the assertion fails if the rendered cost
 * is wrong, not merely if the copy is reworded.
 */
const costedSentence = (template: string, locale: string): string =>
  template
    .replace("{orders}", () => String(SEEDED_COST.paidOrders))
    .replace("{amount}", () => amountLabel(SEEDED_COST.refundTotalHkdCents, locale))
    .replace("{attendees}", () => String(SEEDED_COST.attendees))
    .replace("{registrants}", () => String(SEEDED_COST.rsvpRegistrants));

/** The panel's own section, so the confirmation is not confused with any other status region. */
const cancelSection = (page: Page, copy: Bundle) =>
  page.locator("section", {has: page.getByRole("heading", {name: copy.Admin.eventsMgmt.cancel.heading, exact: true})});

async function openSeededEvent(page: Page, prefix: string): Promise<void> {
  await page.goto(`${prefix}/admin/events-mgmt`);
  await page.getByRole("link", {name: /d4d/i}).first().click();
}

/**
 * Phase D-4d acceptance walk (design §8): staff cancel the dedicated D-4D seeded
 * event from the admin page, having first read the cost the confirmation will
 * spend, and the cancellation then reaches every public surface -- the page stays
 * reachable with no registration control, the listing drops it, and the pass
 * explains the cancellation rather than 404ing.
 *
 * The fixture is D-4b's seed extended with a SECOND, separately-identified event:
 * D-4b's own event cannot be cancelled here, because D-4c's refund walk mutates
 * its one order (and the seed refuses to reuse an order once it is not `paid`),
 * while cancelling leaves `paid` orders that D-4b's check-in walk needs. Three
 * walks, three fates, one fixture.
 *
 * WHAT THIS WALK CANNOT CHECK, stated rather than implied:
 *  - The refund itself. `db:seed:d4b` is provider-free by design (D-4b design §8),
 *    so the seeded orders carry no retrievable Stripe checkout session and the
 *    sweep's `refundOrder` could only answer `provider_failed`. Cancellation is
 *    this walk's subject, not the refund: that interaction is D-4c's, and D-4c's
 *    walk skips for exactly the same reason. This walk cancels, then reads the
 *    public surfaces; it does not claim the money moved.
 *  - The sweep job running. The refund fan-out is a Worker-scheduled sweep, never
 *    invoked by a cancellation request, so nothing here can prove it ran.
 *  - Notifying anyone. RSVP registrants are not emailed by this slice at all
 *    (design §4.6), so there is no message to observe.
 *
 * It writes and the cancellation is irreversible, so it runs once per seed against
 * the isolated database. The walks are ORDERED: seed once, then D-4b, then D-4c,
 * then D-4d. Re-running `db:seed:d4b` does NOT reset the dedicated event once
 * D-4c has refunded D4B's order -- the seed aborts at
 * `D4B_ACCEPTANCE_ORDER_NOT_PAID` before any D-4d write -- so repeating this walk
 * needs a fresh seed, not a re-run. Without every fact below the single case
 * SKIPS -- never fails, and a skip is not a pass.
 */
test.describe("phase D-4d event cancellation", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  test("staff cancel the seeded event, and every public surface explains it", async ({browser}) => {
    const copyEn = bundle(en.locale);
    const copyZh = bundle(zh.locale);
    const publicSlug = new URL(process.env[en.publicUrlVar]!).pathname.split("/events/")[1]!;
    const publicLink = (page: Page) => page.locator(`a[href$="/events/${publicSlug}"]`);

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await signInForM2(staffPage, "staff");

    // 0. Before cancelling: the event IS in the listing and its page DOES offer
    //    checkout. These two facts are why the later absence and absence-of-control
    //    are evidence of the cancellation rather than of a page that never worked.
    await guestPage.goto("/events");
    await expect(publicLink(guestPage).first()).toBeVisible();
    await guestPage.goto(process.env[en.publicUrlVar]!);
    await expect(guestPage.getByRole("button", {name: copyEn.Ticket.submit, exact: true})).toBeVisible();

    // 1. English admin: open the seeded event, open the confirmation, and read the
    //    cost it will spend BEFORE anything is written. Keeping the event proves the
    //    confirmation is a question rather than the act, and leaves the event published.
    await openSeededEvent(staffPage, en.prefix);
    const enCancel = cancelSection(staffPage, copyEn);
    await enCancel.getByRole("button", {name: copyEn.Admin.eventsMgmt.cancel.button, exact: true}).click();
    await expect(enCancel.getByRole("status")).toContainText(costedSentence(copyEn.Admin.eventsMgmt.cancel.confirm, en.locale));
    await enCancel.getByRole("button", {name: copyEn.Admin.eventsMgmt.cancel.keep, exact: true}).click();
    await expect(enCancel.getByRole("status")).toHaveCount(0);
    await expect(enCancel.getByRole("button", {name: copyEn.Admin.eventsMgmt.cancel.button, exact: true})).toBeVisible();

    // 2. zh-HK admin: the same costed confirmation in the other bundle, and then the
    //    one, irreversible cancellation -- committed from the confirmation that just
    //    named its cost.
    await openSeededEvent(staffPage, zh.prefix);
    const zhCancel = cancelSection(staffPage, copyZh);
    await zhCancel.getByRole("button", {name: copyZh.Admin.eventsMgmt.cancel.button, exact: true}).click();
    await expect(zhCancel.getByRole("status")).toContainText(costedSentence(copyZh.Admin.eventsMgmt.cancel.confirm, zh.locale));
    await zhCancel.getByRole("button", {name: copyZh.Admin.eventsMgmt.cancel.button, exact: true}).click();
    // Filtered by the notice's own copy: the action's success message is also a
    // `role="status"`, and both can exist for the moment before the server
    // revalidation replaces the panel with the cancelled state.
    await expect(zhCancel.getByRole("status").filter({hasText: copyZh.Admin.eventsMgmt.cancel.cancelledNotice})).toBeVisible();

    // 3. The public page stays REACHABLE (200, not a 404) and explains the
    //    cancellation, with the registration control ABSENT rather than disabled --
    //    a disabled checkout still invites the idea that a payment is possible.
    for (const [urlVar, copy] of [[en.publicUrlVar, copyEn], [zh.publicUrlVar, copyZh]] as const) {
      const response = await guestPage.goto(process.env[urlVar]!);
      expect(response?.status()).toBe(200);
      await expect(guestPage.getByRole("heading", {name: copy.Events.cancelled.heading, exact: true})).toBeVisible();
      await expect(guestPage.getByText(copy.Events.cancelled.body)).toBeVisible();
      await expect(guestPage.getByRole("button", {name: copy.Ticket.submit, exact: true})).toHaveCount(0);
    }

    // 4. The listing, which carried it in step 0, no longer does -- in both
    //    locales, since the two are separate cached routes.
    await guestPage.goto("/events");
    await expect(publicLink(guestPage)).toHaveCount(0);
    await guestPage.goto("/zh/events");
    await expect(publicLink(guestPage)).toHaveCount(0);

    // 5. The pass page says the event was cancelled instead of 404ing, in both
    //    locales, and offers no QR -- nothing should invite a scan that the
    //    check-in would refuse.
    for (const [urlVar, copy] of [[en.passUrlVar, copyEn], [zh.passUrlVar, copyZh]] as const) {
      const response = await guestPage.goto(process.env[urlVar]!);
      expect(response?.status()).toBe(200);
      await expect(guestPage.getByRole("heading", {name: copy.Pass.cancelled.heading, exact: true})).toBeVisible();
      await expect(guestPage.getByRole("img", {name: copy.Pass.qrLabel})).toHaveCount(0);
    }

    await staffContext.close();
    await guestContext.close();
  });
});
