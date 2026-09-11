import {readFileSync} from "node:fs";

import {expect, test, type Locator} from "@playwright/test";

import {whatsappTemplateSeedRows} from "../fixtures/whatsapp-template-seed";
import {missingM2LiveEnvironment, signInForM2} from "../fixtures/m2-auth";

type Bundle = Readonly<{
  Admin: Readonly<{
    templates: Readonly<{
      title: string;
      goLive: string;
      approve: string;
      status: Readonly<{pending: string; approved: string; rejected: string; disabled: string}>;
      category: Readonly<{marketing: string; utility: string; authentication: string}>;
    }>;
    contacts: Readonly<{
      title: string;
      filters: Readonly<{stage: string; source: string; submit: string}>;
      stage: Readonly<{contacted: string}>;
      source: Readonly<{whatsapp: string}>;
      openThread: string;
    }>;
    segments: Readonly<{title: string; kindContact: string; caption: string}>;
    campaigns: Readonly<{
      title: string;
      steps: Readonly<{name: string; channel: string; template: string; variables: string; segment: string; preview: string}>;
      channel: Readonly<{whatsapp: string}>;
      fields: Readonly<{name: string; template: string; segment: string}>;
      variables: Readonly<{legend: string}>;
      eligibility: Readonly<{eligible: string; not_opted_in: string; suppressed: string}>;
      actions: Readonly<{createDraft: string; submitForReview: string; next: string}>;
      report: Readonly<{total: string}>;
      ownDraft: string;
      templateUnapproved: string;
      noSegments: string;
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

/** The nine rows migration 0034 seeds, read from the twin rather than counted by hand. */
const SEEDED_TEMPLATES = whatsappTemplateSeedRows();

/** The three admin surfaces this phase adds, all of them staff-only. */
const NEW_ADMIN_ROUTES = ["/admin/templates", "/admin/contacts", "/admin/campaigns"] as const;

/** The filter bar on /admin/contacts, told apart from the per-row stage form by its own id. */
const CONTACT_FILTERS = "form:has(#contact-filter-stage)";

/** The wizard's one GET form, identified by the control only its step bar renders. */
const WIZARD = "form:has(button[name=step])";

/**
 * Phase C2 acceptance (plan Task 12,
 * docs/superpowers/plans/2026-09-10-phase-c2-campaigns-and-contacts.md): a
 * template registry that makes "approved" a fact in the database (C-7), a
 * prospect pipeline that reaches the thread a prospect wrote from (C-4), a
 * segment language that can address contacts (C-6), a campaign wizard whose
 * eligibility preview is a real partition rather than a flag (C-5), and a send
 * queue whose route is bearer-gated and whose ten-minute run key makes a second
 * tick inside one window a duplicate (C-5/D-10, S-12).
 *
 * The counterpart that follows a scheduled blast through promotion, claim,
 * dispatch, BODY parameters and back out through a delivery tick is
 * `tests/integration/phase-c2-blast.test.ts`; no browser can see that, and no
 * unit test can see this.
 *
 * Everything that renders an `/admin` page is gated on the isolated M2
 * environment, because the admin surfaces hide themselves from anyone who is
 * not staff (`requireAdminPageActor` → `notFound()`) and there is no anonymous
 * view to assert against. The ungated cases pin what needs no session: that the
 * three new surfaces stay hidden, and that the send queue refuses a request
 * with no bearer.
 */
for (const {locale, prefix} of locales) {
  for (const route of NEW_ADMIN_ROUTES) {
    test(`${locale}: ${route} is hidden from anyone who is not staff`, async ({page}) => {
      // 404 rather than a redirect, and asserted rather than assumed: it is the
      // reason every rendering case below needs a session at all.
      const response = await page.goto(`${prefix}${route}`);
      expect(response?.status()).toBe(404);
    });
  }
}

test("the send queue refuses a request with no bearer", async ({request}) => {
  // `CRON_SECRET` is one shared bearer across every job route, so this is the
  // only thing standing between the open internet and a forced drain. A forced
  // drain can never ORIGINATE a blast — it can only send what a reviewed
  // campaign already committed to `campaign_recipients`, and every recipient is
  // re-checked against current consent before a message leaves — but an
  // unauthenticated one would still be a stranger spending WhatsApp credit.
  const response = await request.post("/api/jobs/whatsapp-send-queue");
  expect(response.status()).toBe(401);
  expect(response.headers()["www-authenticate"]).toBe("Bearer");
});

test.describe("staff read the Phase C2 surfaces", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  for (const {locale, prefix} of locales) {
    const copy = bundle(locale);

    test(`${locale}: /admin/templates lists every seeded key with its category and approval state`, async ({page}) => {
      await signInForM2(page, "staff");
      await page.goto(`${prefix}/admin/templates`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.templates.title})).toBeVisible();
      // The first line of the C-9 go-live checklist, on the page that answers
      // it: 0034 seeds every key `pending`, so a deploy that flips
      // RUN_LIVE_WOZTELL with nothing approved here sends nothing.
      await expect(page.getByText(copy.Admin.templates.goLive)).toBeVisible();

      const body = page.locator("tbody");
      for (const seeded of SEEDED_TEMPLATES) {
        // One ROW per key, not one visible node: the four §8.3 templates have an
        // `element_name` byte-identical to their key, so an exact text match
        // resolves two cells in the same row and a `toBeVisible` on it is a
        // strict-mode violation rather than an assertion.
        await expect(body.locator("tr").filter({has: page.getByText(seeded.key, {exact: true})})).toHaveCount(1);
      }
      // The `marketing` arm of `whatsapp_templates_category_check` had nothing
      // to exercise until Task 1 added §8.3's four marketing templates, and the
      // announcement blast /admin/campaigns exists to send had no template.
      const categories = new Set(SEEDED_TEMPLATES.map((seeded) => seeded.category));
      expect(categories).toContain("utility");
      expect(categories).toContain("marketing");
      expect(await body.getByText(copy.Admin.templates.category.utility, {exact: true}).count()).toBeGreaterThan(0);
      expect(await body.getByText(copy.Admin.templates.category.marketing, {exact: true}).count()).toBeGreaterThan(0);

      // Scoped to `tbody`, because `Admin.templates.columns.approvedAt` is the
      // same word as `Admin.templates.status.approved` in both bundles — a
      // page-wide count would read the column HEADER as an approved template
      // and pass on a registry where nothing had been approved at all.
      //
      // Not "every row is pending" either, which is true only of a registry no
      // walk has touched: the approval walk below approves one row and leaves
      // it approved, so a second run against the same target sees exactly one.
      // The fact that matters for C-9 is that the registry is NOT wholesale
      // approved — nothing is sendable until staff say so, one key at a time.
      const approved = await body.getByText(copy.Admin.templates.status.approved, {exact: true}).count();
      expect(approved).toBeLessThanOrEqual(1);
    });

    test(`${locale}: /admin/contacts round-trips the stage and source filters through the URL`, async ({page}) => {
      await signInForM2(page, "staff");
      await page.goto(`${prefix}/admin/contacts`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.contacts.title})).toBeVisible();

      const filters = page.locator(CONTACT_FILTERS);
      await filters.locator("select[name=stage]").selectOption("contacted");
      await filters.locator("select[name=source]").selectOption("whatsapp");
      await filters.getByRole("button", {name: copy.Admin.contacts.filters.submit}).click();

      await expect(page).toHaveURL(/stage=contacted/);
      await expect(page).toHaveURL(/source=whatsapp/);
      // Re-resolved after the GET submit replaced the document: the selects'
      // values are what prove the server parsed the query back into the filter
      // state, not the browser restoring the old form.
      await expect(page.locator(`${CONTACT_FILTERS} select[name=stage]`)).toHaveValue("contacted");
      await expect(page.locator(`${CONTACT_FILTERS} select[name=source]`)).toHaveValue("whatsapp");
    });

    test(`${locale}: /admin/segments can address the contacts audience`, async ({page}) => {
      await signInForM2(page, "staff");
      // C-6/S-10. The audience is discriminated, not widened: every preview row
      // carries a `kind`, and the contacts arm is the half of the audience the
      // segment language could not name before this phase.
      await page.goto(`${prefix}/admin/segments?audience=contacts&contactSource=whatsapp`);
      await expect(page.getByRole("heading", {level: 1, name: copy.Admin.segments.title})).toBeVisible();

      const rows = page.locator("table tbody tr");
      const shown = await rows.count();
      test.skip(shown === 0, "no WhatsApp contacts on this target");
      // Every row, not the first: an `audience=contacts` query that leaked a
      // member row would be the segment language lying about who it addressed,
      // and a keyset cursor whose predicate lost its parentheses is exactly how
      // that happens (S-10).
      for (let index = 0; index < shown; index += 1) {
        await expect(rows.nth(index).locator("td").first()).toHaveText(copy.Admin.segments.kindContact);
      }
    });
  }
});

test.describe("staff approve a template and build a reviewed campaign", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  const copy = bundle("en");

  /**
   * One walk, not one per locale: approval is a persisted state and a campaign
   * draft is a row. A second pass per locale would approve an approved key and
   * write a second campaign for nothing. The locales are covered above, where
   * they differ.
   */
  test("approving a template makes it sendable", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/templates");
    // The last seeded key, so the walk never competes with the concierge
    // follow-ups C1's own acceptance run may have approved.
    const target = SEEDED_TEMPLATES[SEEDED_TEMPLATES.length - 1].key;
    const row = page.locator("tr", {has: page.getByText(target, {exact: true})});
    await expect(row).toHaveCount(1);

    await row.getByRole("button", {name: copy.Admin.templates.approve, exact: true}).click();

    // Idempotent on purpose: approving an already-approved key is still
    // approved, so this walk can run twice against one target without a reset.
    const approvedRow = page.locator("tr", {has: page.getByText(target, {exact: true})});
    await expect(approvedRow.getByText(copy.Admin.templates.status.approved, {exact: true})).toBeVisible();
  });

  test("a contact with a thread links to the inbox conversation it wrote from", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/contacts?source=whatsapp");
    const thread = page.getByRole("link", {name: copy.Admin.contacts.openThread, exact: true}).first();
    test.skip((await thread.count()) === 0, "no WhatsApp contact with a conversation on this target");

    // C-4's deep link, and the reason the contacts pipeline is worth having
    // beside the inbox: the prospect row and the thread are one person.
    const href = await thread.getAttribute("href");
    expect(href).toMatch(/^\/admin\/inbox\/[0-9a-f-]{36}$/);
    await thread.click();
    expect(page.url()).toContain(href ?? "");
  });

  test("the wizard refuses a blank template variable and previews a real eligibility partition", async ({page}) => {
    await signInForM2(page, "staff");
    await page.goto("/admin/campaigns");
    await expect(page.getByRole("heading", {level: 1, name: copy.Admin.campaigns.title})).toBeVisible();

    const wizard = page.locator(WIZARD);
    const next = wizard.getByRole("button", {name: copy.Admin.campaigns.actions.next, exact: true});
    const name = `Playwright acceptance ${Date.now()}`;

    // Each step is a GET submit, so the answer the previous step collected is a
    // query parameter and the step itself is `?step=`. Waiting on that rather
    // than on the click is what keeps `count()` — which does not auto-wait —
    // from reading the document the browser is about to replace.
    await wizard.getByLabel(copy.Admin.campaigns.fields.name).fill(name);
    await next.click();
    await page.waitForURL(/step=channel/);
    await wizard.locator("select[name=channel]").selectOption("whatsapp");
    await next.click();
    await page.waitForURL(/step=template/);

    // An empty list here means the registry has approved nothing for this
    // channel, which is exactly the state 0034 seeds (S-14) and exactly what
    // the approval walk above fixes.
    const templateSelect = wizard.locator("select[name=templateKey]");
    test.skip((await templateSelect.count()) === 0, "no approved WhatsApp template on this target");
    const chosen = await templateSelect.locator("option").first().textContent() ?? "";
    await templateSelect.selectOption({index: 0});
    await next.click();
    await page.waitForURL(/step=variables/);

    // The variables step, and one field per declared BODY parameter — derived
    // from the config through the option label rather than hard-coded, because
    // a template whose parameter count drifted from the registry sends the
    // right words in the wrong slots and Meta accepts it.
    const expected = declaredVariables(chosen);
    await expect(wizard.locator("legend")).toHaveText(copy.Admin.campaigns.variables.legend);
    const fields = wizard.locator("fieldset input[type=text]");
    await expect(fields).toHaveCount(expected.length);

    for (let index = 0; index < expected.length; index += 1) {
      await fields.nth(index).fill(`Acceptance ${expected[index]}`);
    }
    // One left blank must not advance. The fields are `required`, so the browser
    // refuses the GET submit and the step does not move — which is the same
    // refusal `resolveRecipientVariables` makes at snapshot time and the
    // dispatcher makes at the last gate. Without all three, Meta receives an
    // empty BODY parameter, answers 4xx, and S-15 makes every one permanent.
    await fields.first().fill("");
    await next.click();
    expect(await fields.first().evaluate((field: HTMLInputElement) => field.checkValidity())).toBe(false);
    await expect(wizard.locator("legend")).toHaveText(copy.Admin.campaigns.variables.legend);

    await fields.first().fill(`Acceptance ${expected[0]}`);
    await next.click();
    await page.waitForURL(/step=segment/);

    const segmentSelect = wizard.locator("select[name=segmentId]");
    test.skip((await segmentSelect.count()) === 0, "no saved segment on this target");
    await segmentSelect.selectOption({index: 0});
    await next.click();
    await page.waitForURL(/step=preview/);

    // The preview is a PARTITION of the audience, not a flag: every recipient
    // lands in exactly one category. Before this phase `campaignAudience`
    // derived `suppressed` from an `email_log.status` value no writer in the
    // tree has ever written, and projected no number, no opt-in and no plan —
    // so every count but one was structurally zero.
    // Scoped to the wizard: the campaign LIST below renders a `<dl>` per
    // campaign, so a page-wide selector would count another campaign's channel
    // and status as eligibility categories.
    const counts = wizard.locator("dl div");
    const total = await readCount(wizard, copy.Admin.campaigns.report.total);
    const categories = await counts.count();
    expect(categories).toBeGreaterThan(1);
    let partition = 0;
    for (let index = 0; index < categories - 1; index += 1) {
      partition += Number(await counts.nth(index).locator("dd").innerText());
    }
    expect(partition).toBe(total);

    test.skip(total === 0, "the first saved segment on this target reaches nobody");
    const blocked = await readCount(wizard, copy.Admin.campaigns.eligibility.not_opted_in)
      + await readCount(wizard, copy.Admin.campaigns.eligibility.suppressed);
    // The assertion the old always-`false` flag could never satisfy: on
    // WhatsApp, a member who never opted in and a member who said STOP are
    // different rows of this table and neither of them is `eligible`.
    expect(blocked).toBeGreaterThan(0);

    await page.getByRole("button", {name: copy.Admin.campaigns.actions.createDraft, exact: true}).click();
    // The draft's own page: the wizard's last step writes the first row this
    // screen puts in the database, and the snapshot on it is what the second
    // admin reviews (S-7) — never the segment, which names member emails.
    await expect(page.getByRole("heading", {level: 1, name})).toBeVisible();
    await page.getByRole("button", {name: copy.Admin.campaigns.actions.submitForReview, exact: true}).click();

    // Two-person control, from the creator's side. The reviewer accessor
    // refuses `created_by_profile_id = actor.profileId`, so the creator sees the
    // sentence rather than an approve button that would fail on submit.
    await expect(page.getByText(copy.Admin.campaigns.ownDraft)).toBeVisible();
  });
});

test.describe("the send queue drains on its own ten-minute key", () => {
  test.skip(missing.length > 0, `Requires ${missing.join(", ")}`);

  const secret = process.env.CRON_SECRET?.trim() ?? "";

  test("a second POST inside the same ten minutes is a duplicate", async ({request}) => {
    test.skip(secret === "", "Requires CRON_SECRET");
    const headers = {authorization: `Bearer ${secret}`};

    const first = await request.post("/api/jobs/whatsapp-send-queue", {headers});
    // A 500 means the tick itself could not run on this target, which leaves
    // the job row `failed` — and `jobsRepository.claim` reclaims a failed row,
    // so there would be nothing for the second POST to duplicate. Skipped
    // rather than asserted: the subject here is the run key, not the runner.
    test.skip(first.status() !== 200, `the first tick answered ${first.status()}`);

    const second = await request.post("/api/jobs/whatsapp-send-queue", {headers});

    expect(second.status()).toBe(200);
    // S-12, from the outside. On the `hourly` bucket every tick but the first
    // of each hour would answer this — a queue that looks healthy in every log
    // line and drains once an hour. On `ten-minute` the second POST inside one
    // window is the duplicate and the next window claims a fresh key.
    expect(await second.json()).toMatchObject({duplicate: true});
  });
});

/**
 * The declared BODY parameters behind a wizard option label, which the page
 * renders as `${elementName} (${languageCode})`. Read through the 0034 seed
 * twin so the expectation comes from the same place the registry row does.
 */
function declaredVariables(optionLabel: string): readonly string[] {
  const label = optionLabel.trim();
  const elementName = label.slice(0, label.lastIndexOf(" (")).trim();
  const seeded = SEEDED_TEMPLATES.find((row) => row.elementName === elementName);
  expect(seeded, `no seeded template named ${elementName}`).toBeDefined();
  return seeded?.variables ?? [];
}

/** One row of the eligibility list, read by its label rather than its position. */
async function readCount(scope: Locator, label: string): Promise<number> {
  const row = scope.locator("dl div").filter({hasText: label}).first();
  return Number(await row.locator("dd").innerText());
}
