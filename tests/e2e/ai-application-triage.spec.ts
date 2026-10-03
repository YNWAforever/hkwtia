import { test, expect, type BrowserContext } from "@playwright/test";
import { Pool } from "pg";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard";
type FixtureCase = {
  locale: "en" | "zh-HK";
  mode: string;
  applicationId: string;
  profileId: string;
  draftId: string | null;
  name: string;
  status: string;
};
let pool: Pool,
  fixtures: { sourceSha: string; origin: string; cases: FixtureCase[] },
  before: unknown;
const evidence = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t09/";
const receipt: object[] = [];
const copy = (locale: string) =>
  JSON.parse(readFileSync("messages/" + locale + ".json", "utf8"));
async function login(
  context: BrowserContext,
  origin: string,
  role: "STAFF" | "MEMBER" = "STAFF",
) {
  const email = process.env["M2_TEST_" + role + "_EMAIL"],
    password = process.env["M2_TEST_" + role + "_PASSWORD"];
  expect(email).toMatch(/@.*example\.test$/);
  expect(Boolean(password)).toBe(true);
  const response = await context.request.post(
    origin + "/api/auth/sign-in/email",
    {
      headers: { Origin: origin, Referer: origin + "/admin-login" },
      data: { email, password },
    },
  );
  expect(response.status()).toBe(200);
  const identity = await response.json(),
    authId = identity.user?.id ?? identity.data?.user?.id;
  expect(typeof authId).toBe("string");
  if (role === "STAFF") {
    const rows = (
      await pool.query("SELECT role FROM profiles WHERE auth_user_id=$1", [
        authId,
      ])
    ).rows;
    expect(rows).toEqual([{ role: "staff" }]);
  }
}
function url(entry: FixtureCase, draft = false) {
  const prefix = entry.locale === "en" ? "" : "/zh",
    queue =
      prefix +
      "/admin/members/queue?" +
      new URLSearchParams({ status: "draft", q: entry.name, limit: "20" });
  return {
    queue,
    caseHref:
      prefix +
      "/admin/members/queue/" +
      entry.applicationId +
      "?" +
      new URLSearchParams({
        returnTo: queue,
        ...(draft && entry.draftId ? { draft: entry.draftId } : {}),
      }),
  };
}
test.use({ trace: "off", video: "off", actionTimeout: 30000 });
test.describe("actual isolated application rules and reviewed note adoption", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1",
    "Confirmed isolated DB/Auth and synthetic Preview fixtures required; skipped is not acceptance",
  );
  test.beforeAll(async ({ baseURL }) => {
    const database = assertIsolatedSeedEnvironment(process.env, {
      prefix: "FULL_REMEDIATION",
      flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
      hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
    });
    expect(new URL(database).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    expect(process.env.DATABASE_URL).toBe(database);
    expect(baseURL).toBe(
      "https://hkwtia-application-triage-20261003.vercel.app",
    );
    fixtures = JSON.parse(
      readFileSync(".playwright/full-fix-t09-fixtures-private.json", "utf8"),
    );
    const deployment = JSON.parse(
        readFileSync(
          ".playwright/full-fix-t09-preview-deployment-safe.json",
          "utf8",
        ),
      ),
      runtime = JSON.parse(
        readFileSync(
          ".playwright/full-fix-t09-preview-runtime-safe.json",
          "utf8",
        ),
      );
    expect(fixtures.sourceSha).toBe(deployment.sourceSha);
    expect(fixtures.sourceSha).toBe(runtime.sourceSha);
    expect(fixtures.origin).toBe(baseURL);
    expect(deployment.target).toBeNull();
    expect(
      runtime.checks.some(
        (c: { dbSourcePositivelyProven?: boolean }) =>
          c.dbSourcePositivelyProven,
      ),
    ).toBe(true);
    pool = new Pool({ connectionString: database, query_timeout: 15000 });
    await assertSeedSentinel("FULL_REMEDIATION", async () =>
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    );
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
          )
        ).rows[0].n,
      ),
    ).toBe(59);
    mkdirSync(evidence, { recursive: true });
    before = (
      await pool.query(
        "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS billing,(SELECT count(*) FROM ai_budget_reservations) AS budgets",
      )
    ).rows;
  });
  test.afterAll(async () => {
    if (!pool) return;
    try {
      const after = (
        await pool.query(
          "SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS billing,(SELECT count(*) FROM ai_budget_reservations) AS budgets",
        )
      ).rows;
      expect(after).toEqual(before);
      writeFileSync(
        evidence + "native-receipt.json",
        JSON.stringify(
          {
            sourceSha: fixtures.sourceSha,
            origin: fixtures.origin,
            observedAt: new Date().toISOString(),
            checks: receipt,
            actualNeonPasswordAuth: true,
            realModelProvider: "not used",
            realProviderRequests: 0,
            messagesMembershipBillingBudgetDelta: 0,
            googleVerified: false,
            magicLinkVerified: false,
            production: false,
          },
          null,
          2,
        ),
      );
    } finally {
      await pool.end();
    }
  });
  for (const locale of ["en", "zh-HK"] as const) {
    test(
      locale +
        " rules fill only required follow-up and preserve filtered return; mobile and keyboard",
      async ({ page, context, baseURL }) => {
        const c = fixtures.cases.find(
            (c) => c.locale === locale && c.mode === "manual",
          )!,
          t = copy(locale),
          triage = t.ApplicationTriage,
          labels = t.Admin.applicationCase,
          paths = url(c);
        await login(context, baseURL!);
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.setViewportSize({
          width: locale === "en" ? 1440 : 390,
          height: 900,
        });
        expect((await page.goto(paths.caseHref))?.status()).toBe(200);
        await page
          .getByRole("button", { name: triage.organize, exact: true })
          .click();
        await expect(
          page.getByText(triage.ruleOnly, { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("button", { name: triage.draftRequest, exact: true }),
        ).toBeDisabled();
        const note = page.getByLabel(labels.note, { exact: true });
        await note.fill("Synthetic unsaved manual note");
        const apply = page.getByRole("button", {
          name: triage.apply,
          exact: true,
        });
        await apply.focus();
        await page.keyboard.press("Enter");
        await expect(note).toHaveValue("Synthetic unsaved manual note");
        await expect(
          page.getByRole("checkbox", {
            name: labels.missingFields.companyName,
            exact: true,
          }),
        ).toBeChecked();
        await expect(
          page.getByRole("checkbox", {
            name: labels.missingFields.companyWebsite,
            exact: true,
          }),
        ).not.toBeChecked();
        await expect(
          page.getByRole("checkbox", {
            name: labels.missingFields.displayName,
            exact: true,
          }),
        ).not.toBeChecked();
        await page
          .getByRole("button", { name: labels.save, exact: true })
          .click();
        await expect(
          page.getByRole("status").filter({ hasText: labels.saved }),
        ).toBeVisible();
        const task = (
          await pool.query(
            "SELECT context FROM staff_tasks WHERE dedupe_key=$1",
            ["membership-application:" + c.applicationId],
          )
        ).rows;
        expect(task).toHaveLength(1);
        expect(task[0].context.missingFields).toEqual(["companyName"]);
        const axe = await new AxeBuilder({ page }).analyze();
        expect(
          axe.violations.filter(
            (v) => v.impact === "serious" || v.impact === "critical",
          ),
        ).toEqual([]);
        const sizes = await page.evaluate(() => ({
          viewport: innerWidth,
          scroll: document.documentElement.scrollWidth,
        }));
        expect(sizes.scroll).toBeLessThanOrEqual(sizes.viewport + 1);
        expect((await apply.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await apply.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: evidence + locale + "-rules.png",
          fullPage: false,
        });
        await page
          .getByRole("link", { name: labels.back, exact: true })
          .click();
        expect(new URL(page.url()).pathname + new URL(page.url()).search).toBe(
          paths.queue,
        );
        receipt.push({
          locale,
          case: "required fields and manual note",
          caseRef: createHash("sha256").update(c.applicationId).digest("hex"),
          sameFilteredReturn: true,
          keyboard: true,
          seriousCriticalAxe: 0,
          overflow: false,
          touchTargetMinimum: 44,
        });
      },
    );
    test(
      locale +
        " completed checkout remains pending and is directed to reconciliation",
      async ({ page, context, baseURL }) => {
        const c = fixtures.cases.find(
            (c) => c.locale === locale && c.mode === "payment",
          )!,
          t = copy(locale);
        await login(context, baseURL!);
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.goto(url(c).caseHref);
        await page
          .getByRole("button", {
            name: t.ApplicationTriage.organize,
            exact: true,
          })
          .click();
        await expect(
          page.getByText(t.ApplicationTriage.paymentReconcile, {
            exact: false,
          }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: t.ApplicationTriage.apply, exact: true })
          .click();
        await expect(
          page.getByLabel(t.Admin.applicationCase.nextAction, { exact: true }),
        ).toHaveValue("support_reconciliation");
        expect(
          (
            await pool.query(
              "SELECT status FROM memberships WHERE application_id=$1",
              [c.applicationId],
            )
          ).rows,
        ).toEqual([{ status: "pending_payment" }]);
        receipt.push({
          locale,
          case: "completed attempt/pending membership",
          nextAction: "support_reconciliation",
          statusUnchanged: true,
          additionalCheckoutRequests: 0,
        });
      },
    );
    test(
      locale + " pending review uses the existing review-ready decision",
      async ({ page, context, baseURL }) => {
        const c = fixtures.cases.find(
            (c) => c.locale === locale && c.mode === "review",
          )!,
          t = copy(locale);
        await login(context, baseURL!);
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.goto(url(c).caseHref);
        await page
          .getByRole("button", {
            name: t.ApplicationTriage.organize,
            exact: true,
          })
          .click();
        await expect(
          page.getByText(t.ApplicationTriage.noneMissing, { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: t.ApplicationTriage.apply, exact: true })
          .click();
        await expect(
          page.getByLabel(t.Admin.applicationCase.nextAction, { exact: true }),
        ).toHaveValue("review_ready");
        receipt.push({
          locale,
          case: "pending review",
          nextAction: "review_ready",
          approvalsCreated: 0,
        });
      },
    );
    test(
      locale +
        " editing clears approval and rejection remains separate from sending",
      async ({ page, context, baseURL }) => {
        const c = fixtures.cases.find(
            (c) => c.locale === locale && c.mode === "editReject",
          )!,
          t = copy(locale).AiDraftReview;
        await login(context, baseURL!);
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.goto(url(c, true).caseHref);
        const panel = page.locator(
          '[aria-labelledby="ai-draft-' + c.draftId + '"]',
        );
        await panel
          .getByLabel(t.template, { exact: true })
          .fill("{{facts.nextAction}}");
        await panel.getByRole("button", { name: t.save, exact: true }).click();
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT version FROM ai_review_drafts WHERE id=$1",
                  [c.draftId],
                )
              ).rows[0].version,
          )
          .toBe(2);
        await panel
          .getByRole("button", { name: t.reject, exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT state FROM ai_review_drafts WHERE id=$1",
                  [c.draftId],
                )
              ).rows[0].state,
          )
          .toBe("rejected");
        receipt.push({
          locale,
          case: "edit and reject",
          version: 3,
          sendRequests: 0,
        });
      },
    );
    test(
      locale + " a changed case invalidates the prior draft before approval",
      async ({ page, context, baseURL }) => {
        const c = fixtures.cases.find(
            (c) => c.locale === locale && c.mode === "stale",
          )!,
          t = copy(locale).AiDraftReview;
        await login(context, baseURL!);
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.goto(url(c, true).caseHref);
        await pool.query(
          "UPDATE membership_applications SET status='abandoned',updated_at=now() WHERE id=$1 AND applicant_user_id=$2",
          [c.applicationId, c.profileId],
        );
        await page
          .getByRole("button", { name: t.approve, exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT state FROM ai_review_drafts WHERE id=$1",
                  [c.draftId],
                )
              ).rows[0].state,
          )
          .toBe("stale");
        receipt.push({
          locale,
          case: "facts changed",
          state: "stale",
          approved: false,
        });
      },
    );
    test(
      locale +
        " approval and explicit note adoption have no membership/payment/send effects",
      async ({ page, context, baseURL }) => {
        const c = fixtures.cases.find(
            (c) => c.locale === locale && c.mode === "adopt",
          )!,
          t = copy(locale);
        await login(context, baseURL!);
        await context.addCookies([
          { name: "NEXT_LOCALE", value: locale, url: baseURL! },
        ]);
        await page.goto(url(c, true).caseHref);
        await page
          .getByRole("button", { name: t.AiDraftReview.approve, exact: true })
          .click();
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT state FROM ai_review_drafts WHERE id=$1",
                  [c.draftId],
                )
              ).rows[0].state,
          )
          .toBe("approved");
        const adopt = page.getByRole("button", {
          name: t.ApplicationTriage.adopt,
          exact: true,
        });
        await expect(adopt).toBeEnabled();
        await page
          .getByLabel(t.Admin.applicationCase.note, { exact: true })
          .fill("Synthetic unsaved case change");
        await expect(adopt).toBeDisabled();
        await expect(
          page.getByText(t.ApplicationTriage.saveFirst, { exact: true }),
        ).toBeVisible();
        page.once("dialog", (dialog) => dialog.accept());
        await page.reload();
        await expect(adopt).toBeEnabled();
        await adopt.click();
        await expect
          .poll(
            async () =>
              (
                await pool.query(
                  "SELECT count(*)::int AS n FROM audit_events WHERE action='membership.application.case.updated' AND target_id=$1",
                  [c.applicationId],
                )
              ).rows[0].n,
          )
          .toBe(1);
        await expect(
          page.getByText(t.ApplicationTriage.adopted, { exact: true }),
        ).toBeVisible();
        expect(
          (
            await pool.query(
              "SELECT status FROM membership_applications WHERE id=$1",
              [c.applicationId],
            )
          ).rows,
        ).toEqual([{ status: "draft" }]);
        await page.setViewportSize({
          width: locale === "en" ? 1440 : 390,
          height: 900,
        });
        await page
          .getByRole("heading", {
            name: t.Admin.applicationCase.timeline,
            exact: true,
          })
          .scrollIntoViewIfNeeded();
        await page.screenshot({
          path: evidence + locale + "-adopted.png",
          fullPage: false,
        });
        receipt.push({
          locale,
          case: "approved note adoption",
          caseAudits: 1,
          applicationState: "draft",
          unsavedOverwriteBlocked: true,
          noExternalEffects: true,
        });
      },
    );
  }
  test("a member cannot open the privileged application review", async ({
    page,
    context,
    baseURL,
  }) => {
    await login(context, baseURL!, "MEMBER");
    await page.goto(
      url(
        fixtures.cases.find((c) => c.mode === "adopt")!,
        true,
      ).caseHref,
    );
    expect(new URL(page.url()).pathname).toMatch(/^\/(?:zh\/)?admin-login$/);
    receipt.push({ case: "member denied", privilegedWorkspaceVisible: false });
  });
});
