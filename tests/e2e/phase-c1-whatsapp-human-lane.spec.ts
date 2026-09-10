import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{
    inbox: Readonly<{
      title: string;
      description: string;
      open: string;
      filters: Readonly<{all: string; whatsapp: string; web: string}>;
      columns: Readonly<{channel: string; handling: string}>;
      handling: Readonly<{bot: string; human: string; filterAll: string; filterHuman: string; filterBot: string}>;
      actions: Readonly<{take: string; release: string}>;
      roles: Readonly<{staff: string}>;
      delivery: Readonly<{sent: string}>;
      window: Readonly<{open: string; closed: string; never: string}>;
      compose: Readonly<{legend: string; send: string; sent: string}>;
    }>;
  }>;
}>;

const bundle = (locale: "en" | "zh-HK") =>
  JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8")) as Bundle;

const locales = [
  {locale: "en" as const, prefix: ""},
  {locale: "zh-HK" as const, prefix: "/zh"},
];

const missing = missingM2LiveEnvironment();

/**
 * The sentence Phase A shipped in `Admin.inbox.description`, one per bundle,
 * quoted from the pre-C2 values (`git show e10064b^:messages/*.json`).
 *
 * C-2 rewrote both strings in the same commit as the composer, because a page
 * that still says "read-only" tells staff in two languages that they cannot do
 * the thing they are looking at. Asserted against the BUNDLE VALUE rather than
 * against the rendered page, so it cannot pass because a locator went stale.
 */
const READ_ONLY_SENTENCE = {
  "en": "Read-only in this release",
  "zh-HK": "此版本只可閱讀",
} as const;

/** The composer's form, identified by the one field that only it renders. */
const COMPOSER = "form:has(#inbox-content)";

/**
 * `Admin.inbox.window.open` carries two ICU placeholders, so the countdown can
 * only be asserted as the SHAPE the bundle promises. Built from the bundle
 * string itself: a countdown that stopped rendering its numbers, or a template
 * someone reworded without telling the composer, both fail here.
 */
function countdownPattern(template: string): RegExp {
  const escaped = template.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escaped.replaceAll("\\{hours\\}", "\\d+").replaceAll("\\{minutes\\}", "\\d+"));
}

/**
 * Phase C1 exit checklist (docs/superpowers/plans/2026-09-10-phase-c1-whatsapp-human-lane.md,
 * Task 12): staff can see the two inbox filters, take a WhatsApp thread over, reply inside the
 * 24-hour customer-service window and hand it back — in both locales, and without a live
 * provider credential.
 *
 * D-4 is why the reply walk is meaningful with `RUN_LIVE_WOZTELL` unset: the adapter answers
 * with a `mock:` provider id, the row still moves to `Admin.inbox.delivery.sent`, and C-9 is a
 * flag flip rather than a rewrite. The counterpart that follows the same reply into the
 * `messages` row and back out through a delivery tick is `tests/integration/phase-c1-human-lane.test.ts`;
 * no browser can see that, and no unit test can see this.
 *
 * Everything that renders `/admin/inbox` is gated on the isolated M2 environment, because the
 * admin surface hides itself from anyone who is not staff (`requireAdminPageActor` → `notFound()`)
 * and there is no anonymous view of it to assert against. The ungated cases below pin what does
 * not need a session: that the surface stays hidden, and that both bundles have left Phase A's
 * read-only sentence behind.
 */
for (const {locale, prefix} of locales) {
  const copy = bundle(locale);

  test(`${locale}: /admin/inbox is hidden from anyone who is not staff`, async ({page}) => {
    // 404 rather than a redirect, and asserted rather than assumed: it is the
    // reason the rendering cases below need a session at all, and the whole
    // admin family depends on this staying true.
    const response = await page.goto(`${prefix}/admin/inbox`);
    expect(response?.status()).toBe(404);
  });

  test(`${locale}: the inbox description no longer promises a read-only inbox`, () => {
    expect(copy.Admin.inbox.description).not.toContain(READ_ONLY_SENTENCE[locale]);
    // Not vacuous: the key must still exist and still say something, or the page
    // renders an empty paragraph and this assertion would pass on nothing.
    expect(copy.Admin.inbox.description.length).toBeGreaterThan(0);
  });
}

test.describe("staff reply from the inbox", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  for (const {locale, prefix} of locales) {
    const copy = bundle(locale);

    test(`${locale}: /admin/inbox renders its heading, both filter rows and the reply-capable description`, async ({page}) => {
      await signInForM2(page, "staff");
      await page.goto(`${prefix}/admin/inbox`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.inbox.title})).toBeVisible();

      // Each filter row is a <nav> named by its own column label, which is what
      // lets the two be told apart without depending on markup the design layer
      // may restyle. In zh-HK "handled by a person" is the same string as the
      // column VALUE, so the scoping is load-bearing rather than tidiness.
      const channels = page.getByRole("navigation", {name: copy.Admin.inbox.columns.channel});
      await expect(channels.getByRole("link", {name: copy.Admin.inbox.filters.whatsapp, exact: true})).toBeVisible();
      const handling = page.getByRole("navigation", {name: copy.Admin.inbox.columns.handling});
      await expect(handling.getByRole("link", {name: copy.Admin.inbox.handling.filterHuman, exact: true})).toBeVisible();
      await expect(handling.getByRole("link", {name: copy.Admin.inbox.handling.filterBot, exact: true})).toBeVisible();

      // The rendered value, so the bundle assertion above cannot pass while the
      // page shows something else entirely.
      await expect(page.getByText(copy.Admin.inbox.description)).toBeVisible();
    });
  }

  /**
   * One walk, not one per locale: taking a thread over is a persisted state, so a second pass
   * would find the same thread already `human`, the take-over control correctly absent, and
   * would skip. The locales are covered above, where they differ.
   */
  test("staff take a WhatsApp thread over, reply inside the window and hand it back", async ({page}) => {
    const copy = bundle("en");
    await signInForM2(page, "staff");
    // Both filters at once — the composite the two <nav> rows compose to, and the
    // only listing that is certain to offer a take-over control.
    await page.goto("/admin/inbox?channel=whatsapp&handling=bot");
    const threads = page.getByRole("row").getByRole("link", {name: copy.Admin.inbox.open, exact: true});
    test.skip((await threads.count()) === 0, "no concierge-handled WhatsApp thread on this target");
    await threads.first().click();

    const take = page.getByRole("button", {name: copy.Admin.inbox.actions.take, exact: true});
    const release = page.getByRole("button", {name: copy.Admin.inbox.actions.release, exact: true});
    const composer = page.locator(COMPOSER);
    // Hidden, not disabled, while the concierge still holds the thread (S-12).
    await expect(composer).toHaveCount(0);
    await take.click();
    await expect(composer).toBeVisible();
    // The <legend> element, not `getByText`: "Reply" is a substring of the field
    // label "Your reply", and a substring match would resolve to two nodes.
    await expect(composer.locator("legend")).toHaveText(copy.Admin.inbox.compose.legend);

    // The window notice is the composer's first paragraph and is formatted on the
    // server from the same constant the adapter enforces.
    const notice = composer.locator("p").first();
    const countdown = await notice.textContent() ?? "";
    if (countdown.includes(copy.Admin.inbox.window.closed) || countdown.includes(copy.Admin.inbox.window.never)) {
      // Hand the thread back before skipping: `test.skip` throws, so anything
      // after it never runs, and a thread left `human` would stop the concierge
      // answering that person for good.
      await release.click();
      test.skip(true, "no WhatsApp thread inside the 24-hour customer-service window on this target");
    }
    expect(countdown).toMatch(countdownPattern(copy.Admin.inbox.window.open));

    // Timestamped so repeated runs against one target stay distinguishable in a
    // real inbox — NOT because the send lane needs distinct text. It once did,
    // and this string is why nothing here saw it: `outbound_key` hashed the
    // draft alone, so an identical sentence sent into one thread a second time
    // collided with the settled row and was dropped, and a timestamped draft
    // sidesteps that by construction. C-2 bounded the key to one send attempt;
    // the collision itself is pinned in tests/unit/inbox-repeat-reply.test.ts,
    // which is where it belongs — this walk cannot span two days.
    const reply = `Playwright acceptance ${Date.now()}`;
    await composer.locator("#inbox-content").fill(reply);
    // `exact` matters: "Send" is a substring of the pending label "Sending…".
    await composer.getByRole("button", {name: copy.Admin.inbox.compose.send, exact: true}).click();
    await expect(composer.getByText(copy.Admin.inbox.compose.sent)).toBeVisible();

    // The transcript entry, not the composer's own status line: the row is what
    // carries the attribution and the delivery state, and with RUN_LIVE_WOZTELL
    // unset it reached `sent` against a `mock:` provider id.
    const entry = page.locator("li", {hasText: reply});
    await expect(entry).toContainText(copy.Admin.inbox.roles.staff);
    await expect(entry).toContainText(copy.Admin.inbox.delivery.sent);

    await release.click();
    // Handing back restores `handling: 'bot'`, which is exactly the pair of facts
    // the page renders from it: the composer goes, the take-over control returns.
    await expect(composer).toHaveCount(0);
    await expect(take).toBeVisible();
  });
});
