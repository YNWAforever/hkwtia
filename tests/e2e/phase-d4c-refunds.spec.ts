import {readFileSync} from "node:fs";

import {expect, test, type Page} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{eventsMgmt: Readonly<{
    attendees: string;
    orders: Readonly<{
      heading: string; caption: string; buyer: string; seats: string; amount: string; refundedOn: string;
      refund: string; cancel: string; confirm: string;
      statuses: Readonly<{paid: string; refunded: string}>;
      refundOutcomes: Readonly<{refunded: string}>;
    }>;
  }>}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const en = {locale: "en" as const, prefix: "", passUrlVar: "D4B_PASS_URL_ONE"};
const zh = {locale: "zh-HK" as const, prefix: "/zh", passUrlVar: "D4B_PASS_URL_TWO_ZH"};
const passVars = [en.passUrlVar, zh.passUrlVar];

// A refund can only complete against a payment that exists at the provider.
// `refundOrder` refuses (`provider_failed`) BEFORE it writes when the order
// carries no retrievable Stripe checkout session (`lib/tickets/refund-core.ts`),
// and `db:seed:d4b` is provider-free by design (D-4b design §8), so its order has
// none: the confirmation would answer `providerFailed` and the row would stay
// `paid`, so asserting `Refunded.` would fail rather than prove anything. The walk
// therefore requires an explicit, out-of-band fact that a provider-backed order
// was seeded, decided before any navigation or write so it can never mask a real
// failure as a skip. No fixture in this tree sets it, because minting a refundable
// Stripe test payment is D-4c's one remaining gap: the refund's provider
// interaction is UNVERIFIED in this environment and this skip is the honest record
// of that, exactly as D-4a discloses that it stops at the checkout redirect.
const REFUNDABLE_ORDER_ENV = "D4B_ORDER_REFUNDABLE";
const refundableOrderMissing =
  `${REFUNDABLE_ORDER_ENV}=true (a d4b order backed by a retrievable Stripe test payment; db:seed:d4b is provider-free)`;

// Every missing environment fact is named: a bare "requires acceptance env" can
// never be told apart from a feature that is actually broken.
const missing = [
  ...missingM2LiveEnvironment(),
  ...(process.env.D4B_ACCEPTANCE_SEED === "true" ? [] : ["D4B_ACCEPTANCE_SEED=true"]),
  ...passVars.filter((name) => !process.env[name]?.trim()),
  ...(process.env[REFUNDABLE_ORDER_ENV] === "true" ? [] : [refundableOrderMissing]),
];

const SEAT_ONE = "D4B Acceptance One";
const SEAT_TWO = "D4B Acceptance Two";
const BUYER = "D4B Acceptance Buyer";
// The same formatter the table uses, so the assertion is not a copy of a literal
// that could drift from the rendered amount.
const AMOUNT = new Intl.NumberFormat("en-HK", {style: "currency", currency: "HKD"}).format(500);

// The refunded date is Hong Kong time, not a UTC slice, so the expected string is
// derived from the same formatter the table uses rather than a `YYYY-MM-DD` regex.
const hkdDate = (value: Date, locale: "en" | "zh-HK") =>
  new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"}).format(value);

/**
 * Each table carries an sr-only `<caption>`, which is the table's accessible
 * name, so the region is found by its heading and the table by its caption.
 * Scoping matters: the Orders row's seat cell holds BOTH names as one string, so
 * a page-wide `getByRole("cell", {name: SEAT_ONE})` would match that row too
 * (role-name matching is a substring by default) and every count would be wrong.
 */
const ordersRegion = (page: Page, copy: Bundle) =>
  page.locator("section", {has: page.getByRole("heading", {name: copy.Admin.eventsMgmt.orders.heading})});
const doorRegion = (page: Page, copy: Bundle) =>
  page.locator("section", {has: page.getByRole("heading", {name: copy.Admin.eventsMgmt.attendees})});

async function openSeededEvent(page: Page, prefix: string): Promise<void> {
  await page.goto(`${prefix}/admin/events-mgmt`);
  await page.getByRole("link", {name: /d4b/i}).first().click();
}

/**
 * Phase D-4c acceptance walk (design §8): staff open the seeded event, the Orders
 * section shows D-4b's paid order naming both attendees and the amount, the refund
 * goes through the two-step confirmation, and the three consequences follow — the
 * row becomes `refunded` with a date and no refund control, the seats leave the
 * door list, and the pass URL from D-4b now 404s. Those three are what "refunded"
 * means; a walk that only read `Refunded.` off the row would pass with a broken
 * refund, so the door list and the pass are asserted, not just the confirmation.
 *
 * The refund EMAIL is deliberately not asserted here: the walk cannot read a
 * mailbox. Its send is covered at unit level — the staff refund drives the real
 * `sendOrderRefundEmail` for `event_ticket_refunded` through a fake transport in
 * `tests/unit/refund-email.test.ts` — rather than left as an implicit gap.
 *
 * It writes, so it runs only against the isolated D-4b seed. Three operational
 * facts follow from that:
 *  - `db:seed:d4b` mints ONE paid order holding both seats, and a refund is
 *    whole-order, so the refund can be committed only once. The two-step
 *    confirmation is therefore opened in both locales (both copies asserted) and
 *    the single refund is committed from the zh-HK page; a second refund is
 *    impossible by design, not skipped.
 *  - `refundOrder` calls the payment provider BEFORE it writes, reading the intent
 *    through the order's `stripe_checkout_session_id`. An order without a
 *    retrievable Stripe test checkout session answers `provider_failed` and stays
 *    `paid`, so a real run needs a seeded order that carries one. `db:seed:d4b` is
 *    provider-free by design (D-4b design §8), so the walk also requires
 *    `D4B_ORDER_REFUNDABLE=true` and SKIPS — rather than failing — without it. No
 *    fixture in this tree sets that fact: minting a real Stripe test payment is
 *    D-4c's one remaining gap, so the refund's provider interaction is UNVERIFIED
 *    in this environment. The assertion is kept, never weakened, so a
 *    provider-backed fixture is all this walk needs to become evidence.
 *  - The walk can also run only once per seed: `db:seed:d4b` refuses to reuse its
 *    order once it is no longer `paid`, rather than silently resetting it.
 */
test.describe("phase D-4c refunds and policy", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  test("staff refund the seeded order, and both locales lose the seats", async ({browser}) => {
    const copyEn = bundle(en.locale);
    const copyZh = bundle(zh.locale);

    const staffContext = await browser.newContext();
    const staffPage = await staffContext.newPage();
    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await signInForM2(staffPage, "staff");

    // 1-2. English: the seeded order is paid, and the Orders section names the
    // buyer, both attendees and the amount. The door list still carries the paid
    // seats and the pass still renders — the two facts that make the later absence
    // and 404 evidence of the refund rather than of a page that never worked.
    await openSeededEvent(staffPage, en.prefix);
    const enOrders = ordersRegion(staffPage, copyEn);
    const enRow = enOrders.locator("tbody tr");
    await expect(enRow).toHaveCount(1);
    await expect(enRow).toContainText(BUYER);
    await expect(enRow).toContainText(SEAT_ONE);
    await expect(enRow).toContainText(SEAT_TWO);
    await expect(enRow).toContainText(AMOUNT);
    await expect(enRow).toContainText(copyEn.Admin.eventsMgmt.orders.statuses.paid);

    // 3. The first step of the two-step confirmation names the buyer, the seats
    // and the amount, and cancelling it writes nothing: the row is still paid.
    const enRefund = () => enRow.getByRole("button", {name: copyEn.Admin.eventsMgmt.orders.refund, exact: true});
    await enRefund().click();
    const enConfirm = enOrders.getByRole("status");
    await expect(enConfirm).toContainText(BUYER);
    await expect(enConfirm).toContainText(SEAT_ONE);
    await expect(enConfirm).toContainText(SEAT_TWO);
    await expect(enConfirm).toContainText(AMOUNT);
    await enOrders.getByRole("button", {name: copyEn.Admin.eventsMgmt.orders.cancel, exact: true}).click();
    await expect(enOrders.getByRole("status")).toHaveCount(0);
    await expect(enRow).toContainText(copyEn.Admin.eventsMgmt.orders.statuses.paid);

    const enDoor = doorRegion(staffPage, copyEn).getByRole("table", {name: copyEn.Admin.eventsMgmt.attendees});
    await expect(enDoor.locator("tr", {has: enDoor.getByRole("cell", {name: SEAT_ONE, exact: true})})).toHaveCount(1);
    await expect(enDoor.locator("tr", {has: enDoor.getByRole("cell", {name: SEAT_TWO, exact: true})})).toHaveCount(1);

    await guestPage.goto(process.env[en.passUrlVar]!);
    await expect(guestPage.getByText(SEAT_ONE)).toBeVisible();

    // The zh-HK confirmation, opened while the order is still paid so its copy is
    // exercised before the one refund commits.
    await openSeededEvent(staffPage, zh.prefix);
    const zhOrders = ordersRegion(staffPage, copyZh);
    const zhRow = zhOrders.locator("tbody tr");
    await expect(zhRow).toHaveCount(1);
    await expect(zhRow).toContainText(BUYER);
    await expect(zhRow).toContainText(copyZh.Admin.eventsMgmt.orders.statuses.paid);
    await zhRow.getByRole("button", {name: copyZh.Admin.eventsMgmt.orders.refund, exact: true}).click();
    const zhConfirm = zhOrders.getByRole("status");
    await expect(zhConfirm).toContainText(BUYER);
    await expect(zhConfirm).toContainText(SEAT_ONE);
    await expect(zhConfirm).toContainText(SEAT_TWO);
    await expect(zhConfirm).toContainText(AMOUNT);

    // 3-4. Commit the refund once, from the zh-HK confirmation.
    const refundedOn = new Date();
    await zhOrders.getByRole("button", {name: copyZh.Admin.eventsMgmt.orders.refund, exact: true}).click();
    await expect(zhOrders.getByRole("status")).toContainText(copyZh.Admin.eventsMgmt.orders.refundOutcomes.refunded);
    await expect(zhRow).toContainText(copyZh.Admin.eventsMgmt.orders.statuses.refunded);
    await expect(zhRow).toContainText(copyZh.Admin.eventsMgmt.orders.refundedOn);
    await expect(zhRow).toContainText(hkdDate(refundedOn, zh.locale));
    await expect(zhOrders.getByRole("button", {name: copyZh.Admin.eventsMgmt.orders.refund, exact: true})).toHaveCount(0);

    // 5. The seats leave the door list in zh-HK...
    const zhDoor = doorRegion(staffPage, copyZh).getByRole("table", {name: copyZh.Admin.eventsMgmt.attendees});
    await expect(zhDoor.locator("tr", {has: zhDoor.getByRole("cell", {name: SEAT_ONE, exact: true})})).toHaveCount(0);
    await expect(zhDoor.locator("tr", {has: zhDoor.getByRole("cell", {name: SEAT_TWO, exact: true})})).toHaveCount(0);

    // 6. ...and the pass URL from D-4b now 404s.
    expect((await guestPage.goto(process.env[zh.passUrlVar]!))?.status()).toBe(404);

    // 4-6 again in English, so the English copy of every consequence is exercised
    // and not only the locale the refund was committed from.
    await openSeededEvent(staffPage, en.prefix);
    const enOrdersAfter = ordersRegion(staffPage, copyEn);
    const enRowAfter = enOrdersAfter.locator("tbody tr");
    await expect(enRowAfter).toHaveCount(1);
    await expect(enRowAfter).toContainText(copyEn.Admin.eventsMgmt.orders.statuses.refunded);
    await expect(enRowAfter).toContainText(copyEn.Admin.eventsMgmt.orders.refundedOn);
    await expect(enRowAfter).toContainText(hkdDate(refundedOn, en.locale));
    await expect(enOrdersAfter.getByRole("button", {name: copyEn.Admin.eventsMgmt.orders.refund, exact: true})).toHaveCount(0);

    const enDoorAfter = doorRegion(staffPage, copyEn).getByRole("table", {name: copyEn.Admin.eventsMgmt.attendees});
    await expect(enDoorAfter.locator("tr", {has: enDoorAfter.getByRole("cell", {name: SEAT_ONE, exact: true})})).toHaveCount(0);
    await expect(enDoorAfter.locator("tr", {has: enDoorAfter.getByRole("cell", {name: SEAT_TWO, exact: true})})).toHaveCount(0);

    expect((await guestPage.goto(process.env[en.passUrlVar]!))?.status()).toBe(404);

    await staffContext.close();
    await guestContext.close();
  });
});
