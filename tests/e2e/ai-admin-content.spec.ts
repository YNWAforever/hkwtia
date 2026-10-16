import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInForM2 } from "../fixtures/m2-auth";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard";
const origin = "http://localhost:3450",
  root = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t12/";
const en = JSON.parse(
    readFileSync("messages/en.json", "utf8"),
  ) as typeof import("../../messages/en.json"),
  zh = JSON.parse(
    readFileSync("messages/zh-HK.json", "utf8"),
  ) as typeof import("../../messages/zh-HK.json");
let pool: Pool;
const checks: object[] = [];
test.use({ trace: "off", video: "off" });
test.describe("actual isolated administrative content review, copy-only adoption and bilingual literal reports", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1",
    "Confirmed isolated DB/Auth and synthetic offline proposals required. Skipped is not acceptance.",
  );
  test.beforeAll(async () => {
    const url = assertIsolatedSeedEnvironment(process.env, {
      prefix: "FULL_REMEDIATION",
      flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
      hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
    });
    expect(url).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(url).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    pool = new Pool({ connectionString: url, query_timeout: 15000 });
    await assertSeedSentinel("FULL_REMEDIATION", async () =>
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    );
    expect(
      JSON.parse(
        readFileSync(
          ".playwright/full-fix-t12-local-runtime-safe.json",
          "utf8",
        ),
      ),
    ).toMatchObject({
      origin,
      ledger: 61,
      production: false,
      dbSourcePositivelyProven: true,
    });
    mkdirSync(root, { recursive: true });
  });
  test.afterAll(async () => {
    writeFileSync(
      root + "native-current.json",
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          sourceSha: process.env.FULL_FIX_EXPECTED_SOURCE_SHA,
          actualPasswordAuth: true,
          syntheticOfflineProposals: true,
        humanPilotVerified: false,
          externalModelCalls: 0,
          realProviderSends: 0,
          googleVerified: false,
          magicLinkVerified: false,
          production: false,
          checks,
        },
        null,
        2,
      ),
    );
    await pool?.end();
  });
  for (const locale of ["en", "zh-HK"] as const)
    test(
      locale +
        " reviews event/news drafts, copies only approved text and renders a distinct literal board report",
      async ({ page }) => {
        test.setTimeout(180000);
        await signInForM2(page, "staff");
        const session = await page.request.get("/api/auth/get-session");
        const identity = (await session.json()).user;
        expect(
          (
            await pool.query(
              "SELECT id,role FROM profiles WHERE auth_user_id=$1",
              [identity.id],
            )
          ).rows,
        ).toEqual([{ id: "m2-staff-01", role: "staff" }]);
        const fixture = JSON.parse(
          execFileSync(
            process.execPath,
            [
              "--conditions=react-server",
              "--import",
              "tsx",
              "scripts/lib/full-content-draft-fixture.ts",
              locale,
            ],
            {
              encoding: "utf8",
              env: { ...process.env, NODE_ENV: "test" },
              timeout: 60000,
              windowsHide: true,
            },
          ),
        );
        expect(fixture).toMatchObject({
          syntheticOfflineFixture: true,
          externalModelCalls: 0,
          production: false,
        });
        const m = locale === "en" ? en : zh,
          t = m.ContentAssistance,
          prefix = locale === "en" ? "/en" : "/zh";
        for (const entry of fixture.entries as {
          kind: "event" | "news";
          id: string;
          draftId: string;
          version: number;
        }[]) {
          const path =
            prefix +
            "/admin/" +
            (entry.kind === "event" ? "events-mgmt" : "news") +
            "/" +
            entry.id;
          const table = entry.kind === "event" ? "events" : "posts";
          const original = (
            await pool.query("SELECT * FROM " + table + " WHERE id=$1", [
              entry.id,
            ])
          ).rows[0];
          await page.goto(
            origin +
              prefix +
              "/admin/ai-review?" +
              new URLSearchParams({ draft: entry.draftId }),
          );
          await page
            .getByRole("button", { name: m.AiDraftReview.approve, exact: true })
            .press("Enter");
          await expect
            .poll(
              async () =>
                (
                  await pool.query(
                    "SELECT state FROM ai_review_drafts WHERE id=$1",
                    [entry.draftId],
                  )
                ).rows[0].state,
            )
            .toBe("approved");
          await page
            .getByRole("link", {
              name: m.AiDraftReview.openContent,
              exact: true,
            })
            .press("Enter");
          await expect(
            page.getByRole("heading", { name: t.title, exact: true }),
          ).toBeVisible();
          const form = page.locator("form").filter({
            has: page.locator(
              'textarea[name="' +
                (entry.kind === "event" ? "descriptionEn" : "bodyMdx") +
                '"]',
            ),
          });
          const fieldsBefore = await form.evaluate((node) =>
            Object.fromEntries(new FormData(node as HTMLFormElement)),
          );
          const target =
            entry.kind === "event"
              ? locale === "en"
                ? "descriptionEn"
                : "descriptionZh"
              : locale === "en"
                ? "bodyMdx"
                : "bodyMdxZhHk";
          await page
            .getByRole("button", { name: t.adopt, exact: true })
            .press("Enter");
          await expect(
            page.locator('textarea[name="' + target + '"]'),
          ).toHaveValue(/Review source records|請檢視來源紀錄/);
          const fieldsAfter = await form.evaluate((node) =>
            Object.fromEntries(new FormData(node as HTMLFormElement)),
          );
          for (const [key, value] of Object.entries(fieldsBefore))
            if (key !== target) expect(fieldsAfter[key]).toEqual(value);
          expect(
            (
              await pool.query("SELECT * FROM " + table + " WHERE id=$1", [
                entry.id,
              ])
            ).rows[0],
          ).toEqual(original);
          await expect(
            page.getByRole("button", { name: t.prepare, exact: true }),
          ).toBeDisabled();
          const labels =
            entry.kind === "event" ? m.Admin.eventsMgmt : m.Admin.news;
          await page
            .getByRole("button", { name: labels.previewDraft, exact: true })
            .press("Enter");
          await expect(
            page.getByRole("region", {
              name: labels.previewPrivate,
              exact: true,
            }),
          ).toBeVisible();
          await page.screenshot({
            path: root + locale + "-" + entry.kind + "-content-desktop.png",
            fullPage: true,
          });
          await page.setViewportSize({ width: 390, height: 844 });
          expect(
            await page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          ).toBe(true);
          expect(
            (await new AxeBuilder({ page }).include("main").analyze())
              .violations,
          ).toEqual([]);
          await page.screenshot({
            path: root + locale + "-" + entry.kind + "-content-mobile.png",
            fullPage: true,
          });
          // Keep the synthetic edit private; ordinary save/preview/publish journeys were independently verified in T17.
          page.once("dialog", (dialog) => dialog.accept());
          await page.goto(origin + path);
          // The persisted source changes after render. The real adopter must recheck it and leave the editor unchanged.
          await pool.query(
            entry.kind === "event"
              ? "UPDATE events SET capacity=40 WHERE id=$1"
              : "UPDATE posts SET title_en=title_en||' revised',updated_at=now() WHERE id=$1",
            [entry.id],
          );
          const beforeStale = await page
            .locator('textarea[name="' + target + '"]')
            .inputValue();
          await page
            .getByRole("button", { name: t.adopt, exact: true })
            .press("Enter");
          await expect(page.getByText(t.stale, { exact: true })).toBeVisible();
          expect(
            await page.locator('textarea[name="' + target + '"]').inputValue(),
          ).toBe(beforeStale);
          await page.setViewportSize({ width: 1440, height: 1000 });
          checks.push({
            locale,
            kind: entry.kind,
            staffReviewActionVerified: true,
            copyOnly: true,
            unchangedBusinessAndPublicationFields: true,
            staleFactsBlocked: true,
            mobile390: true,
            axeViolations: 0,
          });
        }
        await page.goto(
          origin + prefix + "/admin/reports/board-drafts/" + fixture.boardId,
        );
        await expect(
          page.locator("main header").getByRole("heading", { level: 1 }),
        ).toContainText(m.Admin.reports.generatedReport.title);
        await expect(
          page.getByText(
            locale === "en"
              ? "Narrative: Review the reporting window."
              : "正文: 請檢視報告期間。",
            { exact: true },
          ),
        ).toBeVisible();
        await expect(page.getByRole("table")).toHaveCount(1);
        await expect(page.getByRole("rowheader")).toHaveCount(10);
        await expect(
          page.getByRole("heading", {
            level: 2,
            name: m.Admin.reports.generatedReport.kpis,
            exact: true,
          }),
        ).toBeVisible();
        expect(
          await page.locator("main script,main iframe,main object").count(),
        ).toBe(0);
        await page.screenshot({
          path: root + locale + "-board-content-desktop.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(
          (await new AxeBuilder({ page }).include("main").analyze()).violations,
        ).toEqual([]);
        await page.screenshot({
          path: root + locale + "-board-content-mobile.png",
          fullPage: true,
        });
        checks.push({
          locale,
          kind: "board",
          independentLocalizedBody: true,
          literalRenderer: true,
          mobile390: true,
          axeViolations: 0,
        });
      },
    );
});
