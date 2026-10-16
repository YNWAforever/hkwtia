import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
import { Pool } from "pg";
import { test, expect } from "@playwright/test";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard";
import { signInForM2 } from "../fixtures/m2-auth";
const en: typeof import("../../messages/en.json") = JSON.parse(
    readFileSync("messages/en.json", "utf8"),
  ),
  zh: typeof import("../../messages/zh-HK.json") = JSON.parse(
    readFileSync("messages/zh-HK.json", "utf8"),
  );
const origin = "http://localhost:3450",
  root = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t11/";
const checks: unknown[] = [];
let pool: Pool;
test.describe("actual isolated retention human review", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1",
    "Requires positively verified isolated DB/Auth and synthetic identities.",
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
          ".playwright/full-fix-t11-local-runtime-safe.json",
          "utf8",
        ),
      ),
    ).toMatchObject({
      origin,
      ledger: 60,
      dbSourcePositivelyProven: true,
      production: false,
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
          syntheticOfflineDrafts: true,
          externalModelCalls: 0,
          realProviderSends: 0,
          production: false,
          checks,
        },
        null,
        2,
      ),
    );
    await pool?.end();
  });
  for (const locale of ["en", "zh-HK"] as const) {
    test(
      locale +
        " shows current fact snapshots and prevents stale approval with an independent renewal batch path",
      async ({ page }) => {
        await signInForM2(page, "staff");
        const t = (locale === "en" ? en : zh).Admin.approvals,
          prefix = locale === "en" ? "/en" : "/zh";
        const seed = () =>
          JSON.parse(
            execFileSync(
              process.execPath,
              [
                "--conditions=react-server",
                "--import",
                "tsx",
                "scripts/lib/full-retention-review-fixture.ts",
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
        const outboundBefore = Number(
          (
            await pool.query(
              "SELECT count(*)::int AS n FROM messages WHERE direction='outbound'",
            )
          ).rows[0].n,
        );
        const fresh = seed();
        expect(fresh).toMatchObject({
          syntheticOfflineFixture: true,
          externalModelCalls: 0,
          production: false,
        });
        await page.goto(origin + prefix + "/admin/approvals");
        const row = page
          .locator("tr")
          .filter({
            has: page.locator(
              'input[name=approvalId][value="' + fresh.approvalId + '"]',
            ),
          });
        await expect(row.getByText(t.periodEnd, { exact: true })).toBeVisible();
        await expect(
          row.getByText(fresh.renewalDate, { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("link", { name: t.renewalBatch, exact: true }),
        ).toHaveAttribute(
          "href",
          locale === "en"
            ? "/admin/members/communications"
            : "/zh/admin/members/communications",
        );
        await row
          .getByRole("button", { name: t.approve, exact: true })
          .press("Enter");
        await expect
          .poll(
            async () =>
              (
                await pool.query("SELECT status FROM approvals WHERE id=$1", [
                  fresh.approvalId,
                ])
              ).rows[0].status,
          )
          .toBe("approved");
        const stale = seed();
        await page.reload();
        const staleRow = page
          .locator("tr")
          .filter({
            has: page.locator(
              'input[name=approvalId][value="' + stale.approvalId + '"]',
            ),
          });
        await pool.query(
          "UPDATE profiles SET consent_marketing=false WHERE id=$1",
          [stale.profileId],
        );
        await staleRow
          .getByRole("button", { name: t.approve, exact: true })
          .press("Enter");
        await expect(staleRow.getByRole("alert")).toHaveText(t.stale);
        expect(
          (
            await pool.query("SELECT status FROM approvals WHERE id=$1", [
              stale.approvalId,
            ])
          ).rows[0].status,
        ).toBe("pending");
        await page.screenshot({
          path: root + locale + "-retention-review-desktop.png",
          fullPage: true,
        });
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({
          path: root + locale + "-retention-review-mobile.png",
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        ).toBe(true);
        expect(
          (await new AxeBuilder({ page }).include("main").analyze()).violations,
        ).toEqual([]);
        // Navigate while this pending row still supplies the handoff link. Approval does not send.
        await page
          .getByRole("link", { name: t.renewalBatch, exact: true })
          .press("Enter");
        await expect
          .poll(async () => new URL(page.url()).pathname)
          .toBe(
            (locale === "en" ? "" : "/zh") + "/admin/members/communications",
          );
        await page.goto(origin + prefix + "/admin/approvals");
        // Stale facts must never prevent a human from rejecting the proposal.
        await staleRow
          .getByRole("button", { name: t.reject, exact: true })
          .press("Enter");
        await expect
          .poll(
            async () =>
              (
                await pool.query("SELECT status FROM approvals WHERE id=$1", [
                  stale.approvalId,
                ])
              ).rows[0].status,
          )
          .toBe("rejected");
        expect(
          Number(
            (
              await pool.query(
                "SELECT count(*)::int AS n FROM messages WHERE direction='outbound'",
              )
            ).rows[0].n,
          ),
        ).toBe(outboundBefore);
        checks.push({
          locale,
          case: "real staff password Auth; offline synthetic proposal approved, changed-consent proposal blocked and human rejection allowed; separate renewal batch navigation;390 keyboard axe0",
          outboundMessages: 0,
          externalModelCalls: 0,
        });
      },
    );
  }
});
