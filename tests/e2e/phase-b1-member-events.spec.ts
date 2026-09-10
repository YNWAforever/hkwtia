import {readFileSync} from "node:fs";

import {expect, test, type Page} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Events: Readonly<{
    filters: Readonly<{apply: string; formats: Readonly<{online: string}>}>;
    detail: Readonly<{organiser: string}>;
    guest: Readonly<{submit: string; registered: string; invalid: string; cancelInvalid: string}>;
  }>;
  Portal: Readonly<{
    memberEvents: Readonly<{newTitle: string; submit: string; submitted: string; saveDraft: string; draftSaved: string}>;
  }>;
  Admin: Readonly<{eventsMgmt: Readonly<{review: Readonly<{title: string; approve: string}>}>}>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

const missing = missingM2LiveEnvironment();

// How many listed events the anonymous probe opens before giving up. The listing is ordered by
// start time, so the soonest few are an honest sample; opening every card on a well-stocked
// target would cost far more than the case is worth.
const GUEST_RSVP_PROBE_LIMIT = 6;

/**
 * Opens open events from `${prefix}/events` in listing order until one renders the anonymous
 * RSVP form, and leaves `page` on it. Returns the href it settled on (or null) together with the
 * number of events actually opened, which is what the skip message needs to be specific.
 *
 * The listing's `.first()` link is not a good enough sample: an `external` or a `ticketed`
 * registration mode, and an event that has already started, each render something other than the
 * guest form, so a spec that only looked at the soonest card reported "not open to guest RSVP"
 * whenever that card happened to be one of those — indistinguishable in a report from the form
 * having broken. Each card contributes two links to the same slug (the heading and the "View
 * event" action), hence the de-duplication.
 */
async function firstGuestRsvpEvent(page: Page, prefix: string): Promise<Readonly<{href: string | null; opened: number}>> {
  await page.goto(`${prefix}/events?status=open`);
  const hrefs: string[] = [];
  for (const link of await page.locator(".event-library a[href*='/events/']").all()) {
    const href = await link.getAttribute("href");
    if (href && !hrefs.includes(href)) hrefs.push(href);
    if (hrefs.length === GUEST_RSVP_PROBE_LIMIT) break;
  }
  for (const [index, href] of hrefs.entries()) {
    await page.goto(href);
    if ((await page.locator("form.guest-rsvp-form").count()) > 0) return {href, opened: index + 1};
  }
  return {href: null, opened: hrefs.length};
}

/**
 * Phase B1 exit checklist (docs/superpowers/plans/2026-09-09-phase-b1-member-events.md, B-8),
 * measured against the programme's Phase B gate sentence (spec §5): "a Startup member publishes
 * an event that appears on /events with organiser attribution after staff approval; a guest RSVPs
 * without signing in and receives confirmation".
 *
 * The gated walk at the bottom is that sentence end to end — submit, prove the event is *not*
 * public, approve as staff, read it back on /events and /events/<slug> with its organiser, then
 * RSVP to it from a signed-out context. It writes, so it runs only against the isolated M2
 * environment: `missingM2LiveEnvironment()` demands `DATABASE_URL_TEST` and the `M2_TEST_NEON_*`
 * allowlist alongside the credentials, and therefore cannot fire at a shared or production
 * database. The anonymous cases above it only read — the filter round-trip (B-6), the guest
 * form's rejection of a malformed address before it writes (B-4), and the cancel link's landing
 * states — so they run against any target.
 *
 * Every skip names the environment fact that was missing. The one recorded run of the previous
 * version of this file skipped all four cases with a bare "no open events on this target", which
 * a reader cannot tell apart from a broken feature.
 */
for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: /events filter panel round-trips the format filter`, async ({page}) => {
    await page.goto(`${prefix}/events`);
    const panel = page.locator("form.event-filter-panel");
    const format = panel.locator("select[name=format]");
    // The bundle owns the option label; the value is the enum the repository filters on.
    await expect(format.locator("option[value=online]")).toHaveText(copy.Events.filters.formats.online);
    await format.selectOption("online");
    await panel.getByRole("button", {name: copy.Events.filters.apply}).click();
    await expect(page).toHaveURL(/format=online/);
    // Re-resolved after the GET submit replaced the document: the select's value is what proves
    // the server parsed the query back into the filter state, not the browser restoring a form.
    await expect(page.locator("form.event-filter-panel select[name=format]")).toHaveValue("online");
  });

  test(`${locale}: guest RSVP form rejects a malformed address before writing`, async ({page}) => {
    const {href, opened} = await firstGuestRsvpEvent(page, prefix);
    // Both outcomes are legitimate states of a target nobody has seeded, so this skips rather
    // than fails — but it says which one it was and how hard it looked, so "environment not
    // provisioned" can never be read as "guest RSVP is broken".
    test.skip(href === null, opened === 0
      ? `environment not provisioned: ${prefix}/events?status=open lists no open event, so there is nothing to RSVP to`
      : `environment not provisioned: none of the ${opened} soonest open events on ${prefix}/events offers the anonymous RSVP form (each is external, ticketed, or already under way)`);
    // firstGuestRsvpEvent left the page on the event it settled on.
    const form = page.locator("form.guest-rsvp-form");
    // `name` is filled with a valid value on purpose. It is `required` too and the form posts
    // with `noValidate`, so leaving it empty made the submission invalid for two reasons at once
    // and this case would still have passed with the email check deleted outright.
    await form.locator("input[name=name]").fill("Playwright Guest");
    await form.locator("input[name=email]").fill("not-an-email");
    await form.getByRole("button", {name: copy.Events.guest.submit}).click();
    const status = form.locator("#guest-rsvp-status");
    await expect(status).toHaveClass(/form-error/);
    await expect(status).toHaveText(copy.Events.guest.invalid);
  });
}

/**
 * B-4's one-click cancel link, as far as a browser can follow it. `/api/events/guest/cancel`
 * rejects a malformed token on shape and hands a well-formed unknown one to the repository;
 * both land on /events with a status the page renders, and neither touches a row, so these run
 * against any target and can never skip.
 *
 * The cancelling half is not reachable from a browser at all: the token exists only in the
 * confirmation email, only its HMAC digest is stored, and the preview transport keeps nothing a
 * request could read back. `tests/unit/event-guests-repository.test.ts` owns that path.
 *
 * One case per token, not one per locale: the route redirects to a locale-less `/events`, so the
 * landing page is whatever the proxy resolves for a cookie-less visit — the default locale in a
 * fresh context. The locale is read back off the landed URL rather than assumed, so a change to
 * that redirect fails on the URL assertion rather than on mismatched copy.
 */
for (const token of ["not-a-token", "0123456789abcdef0123456789abcdef"]) {
  test(`the guest cancel link lands on /events for token "${token.slice(0, 12)}"`, async ({page}) => {
    await page.goto(`/api/events/guest/cancel?token=${token}`);
    await expect(page).toHaveURL(/\/events\?guest=(invalid|unknown)$/);
    const landed = bundle(new URL(page.url()).pathname.startsWith("/zh/") ? "zh-HK" : "en");
    await expect(page.getByText(landed.Events.guest.cancelInvalid, {exact: true})).toBeVisible();
  });
}

test.describe("member publishing, staff approval and the public event", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  for (const {locale, prefix} of locales) {
    const copy = bundle(locale);

    test(`${locale}: a submitted event reaches /events with its organiser once staff approve it`, async ({page, browser}) => {
      await signInForM2(page, "company-admin");
      await page.goto(`${prefix}/portal/events/new`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Portal.memberEvents.newTitle})).toBeVisible();
      const slug = `e2e-${locale === "en" ? "en" : "zh"}-${Date.now()}`;
      const title = `E2E ${slug}`;
      await page.fill("input[name=slug]", slug);
      await page.fill("input[name=titleEn]", title);
      await page.fill("textarea[name=descriptionEn]", "Playwright acceptance event");
      await page.fill("input[name=startsAt]", "2031-01-15T10:00");
      // Capacity is deliberately left blank: an uncapped event makes the guest RSVP at the end of
      // this walk deterministically `registered` rather than `waitlist`.
      // Two submit buttons post `intent=draft|submit` from the same form; the bundle names them.
      await page.getByRole("button", {name: copy.Portal.memberEvents.saveDraft}).click();
      await expect(page.getByText(copy.Portal.memberEvents.draftSaved)).toBeVisible();
      // Submit is disabled by design when the fixture company's plan has no event quota left
      // (Community gets none; Startup gets two per calendar quarter, and this walk spends one per
      // locale). Asserting enabled first puts that cause in the report — clicking a disabled
      // button would instead fail as an unexplained action timeout.
      const submit = page.getByRole("button", {name: copy.Portal.memberEvents.submit});
      await expect(submit, "the M2 company-admin fixture needs a plan with event quota left this quarter; Startup allows two, and each run of this walk spends one per locale").toBeEnabled();
      await submit.click();
      await expect(page.getByText(copy.Portal.memberEvents.submitted)).toBeVisible();

      // The gate sentence says "after staff approval", so prove the negative first: without this,
      // a regression that published on submit would satisfy every assertion below.
      const beforeApproval = await page.goto(`${prefix}/events/${slug}`);
      expect(beforeApproval?.status()).toBe(404);

      const staffContext = await browser.newContext();
      const staffPage = await staffContext.newPage();
      await signInForM2(staffPage, "staff");
      await staffPage.goto(`${prefix}/admin/events-mgmt`);
      await expect(staffPage.getByRole("heading", {name: copy.Admin.eventsMgmt.review.title})).toBeVisible();
      // Scoped to the queue row by its slug cell, never page-wide: the "existing events" section
      // further down the same page lists every event under the same title, so a page-wide
      // getByRole("link", {name: title}) resolves to two elements and fails strict mode.
      const row = staffPage.locator("tr", {has: staffPage.getByText(slug, {exact: true})});
      await expect(row).toHaveCount(1);
      await expect(row.getByRole("link", {name: title})).toBeVisible();
      // Column two is companies.display_name joined onto the queue row (B-3); "—" is what an
      // admin-authored event with no organiser renders there. Reading it proves the join and
      // gives the public assertion below the organiser's name without a fixture constant.
      const organiser = (await row.locator("td").nth(1).innerText()).trim();
      expect(organiser).not.toBe("—");
      await row.getByRole("button", {name: copy.Admin.eventsMgmt.review.approve}).click();
      await expect(row).toHaveCount(0);
      await staffContext.close();

      // Both public routes are `force-dynamic`, so these read the live projection: what they pin
      // is the approve → published → public composition (the repository transition, the public
      // projection and the card), not the cache invalidation the action also performs.
      await page.goto(`${prefix}/events`);
      await expect(page.locator(".event-library").getByRole("link", {name: title})).toBeVisible();

      const afterApproval = await page.goto(`${prefix}/events/${slug}`);
      expect(afterApproval?.status()).toBe(200);
      await expect(page.getByRole("heading", {level: 1, name: title})).toBeVisible();
      // "with organiser attribution": the facts grid pairs the bundle's label with the same
      // company name staff saw in the review queue.
      const attribution = page.locator(".event-detail-facts > div", {has: page.getByText(copy.Events.detail.organiser, {exact: true})});
      await expect(attribution.locator("strong")).toHaveText(organiser);

      // "a guest RSVPs without signing in": a fresh context, because the detail page offers the
      // guest form only when there is no session, and `page` is still the company admin.
      const guestContext = await browser.newContext();
      const guestPage = await guestContext.newPage();
      await guestPage.goto(`${prefix}/events/${slug}`);
      const form = guestPage.locator("form.guest-rsvp-form");
      await expect(form).toBeVisible();
      await form.locator("input[name=name]").fill("Playwright Guest");
      await form.locator("input[name=email]").fill(`${slug}@example.com`);
      await form.getByRole("button", {name: copy.Events.guest.submit}).click();
      // `registered`, never `waitlist` (the event carries no capacity) and never `already` (the
      // address carries this run's timestamp). A `rateLimited` message here means the walk ran
      // more than twice inside the RSVP limiter's 15-minute, five-per-client window, not a
      // regression in the RSVP path.
      const status = form.locator("#guest-rsvp-status");
      await expect(status).toHaveText(copy.Events.guest.registered);
      await expect(status).not.toHaveClass(/form-error/);
      await guestContext.close();
    });
  }
});
