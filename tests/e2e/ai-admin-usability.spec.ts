import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signInForM2 } from "../fixtures/m2-auth";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard";
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3450",
  root = process.env.FULL_FIX_EVIDENCE_ROOT ?? "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/";
const en = JSON.parse(
    readFileSync("messages/en.json", "utf8"),
  ) as typeof import("../../messages/en.json"),
  zh = JSON.parse(
    readFileSync("messages/zh-HK.json", "utf8"),
  ) as typeof import("../../messages/zh-HK.json");
let pool: Pool;
const checks: object[] = [];
test.use({ trace: "off", video: "off" });
test.describe("actual isolated administrative usability", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1",
    "BLOCKED: positively proven isolated DB/Auth and synthetic identities required; skipped is not acceptance.",
  );
  test.beforeAll(async () => {
    expect(["docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/", "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t16/"]).toContain(root);
    const db = assertIsolatedSeedEnvironment(process.env, {
      prefix: "FULL_REMEDIATION",
      flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
      hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
    });
    expect([
      "http://localhost:3450",
      "https://hkwtia-usability-20261003.vercel.app",
    ]).toContain(origin);
    expect(db).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(db).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    pool = new Pool({ connectionString: db, query_timeout: 15000 });
    await assertSeedSentinel("FULL_REMEDIATION", async () =>
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    );
    expect(
      JSON.parse(
        readFileSync(
          origin.startsWith("https:")
            ? ".playwright/full-fix-t15-preview-runtime-safe.json"
            : ".playwright/full-fix-t15-local-runtime-safe.json",
          "utf8",
        ),
      ),
    ).toMatchObject({
      origin,
      ledger: 61,
      dbSourcePositivelyProven: true,
      production: false,
    });
    mkdirSync(root, { recursive: true });
  });
  test.afterAll(async () => {
    writeFileSync(
      root +
        (origin.startsWith("https:")
          ? "native-preview.json"
          : "native-current.json"),
      JSON.stringify(
        {
          sourceSha: process.env.FULL_FIX_EXPECTED_SOURCE_SHA,
          origin,
          syntheticOnly: true,
          externalModelCalls: 0,
          realProviderSends: 0,
          humanStaffPilotVerified: false,
          screenReaderHumanVerified: false,
          regionalPerformanceVerified: false,
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
        " presents readable review facts and usable state/deadline filters",
      async ({ page }) => {
        await signInForM2(page, "staff");
        const m = locale === "en" ? en : zh,
          t = m.Admin.approvals,
          prefix = locale === "en" ? "/en" : "/zh";
        const response = await page.request.get("/api/auth/get-session");
        const identity = (await response.json()).user;
        expect(
          (
            await pool.query(
              "SELECT role FROM profiles WHERE auth_user_id=$1",
              [identity.id],
            )
          ).rows[0]?.role,
        ).toBe("staff");
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto(origin + prefix + "/admin/approvals");
        const row = page
          .locator("tr")
          .filter({ has: page.getByText(t.plan, { exact: true }) })
          .first();
        await expect(row).toBeVisible();
        await page.screenshot({
          path:
            root +
            locale +
            (origin.startsWith("https:") ? "-preview" : "") +
            "-approvals-" +
            (process.env.FULL_FIX_UI_PHASE ?? "after") +
            "-mobile.png",
          fullPage: true,
        });
        const summary = row.locator("td").nth(1);
        expect
          .soft(
            await summary.evaluate((el) => el.getBoundingClientRect().width),
          )
          .toBeGreaterThanOrEqual(280);
        await expect
          .soft(
            summary.getByText(m.Admin.members.planCodes.startup, {
              exact: true,
            }),
          )
          .toBeVisible();
        const region = page.getByRole("region", { name: t.caption });
        await expect.soft(region).toBeVisible();
        if (await region.count()) {
          await region.focus();
          await expect(region).toBeFocused();
          await page.keyboard.press("ArrowRight");
          await expect
            .poll(() => region.evaluate((el) => el.scrollLeft))
            .toBeGreaterThan(0);
        }
        await summary.scrollIntoViewIfNeeded();
        await page.screenshot({
          path:
            root +
            locale +
            (origin.startsWith("https:") ? "-preview" : "") +
            "-approvals-readable-mobile.png",
          fullPage: true,
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        const loadStart = Date.now();
        const reviewResponse = await page.goto(
          origin + prefix + "/admin/ai-review",
        );
        expect(reviewResponse?.status()).toBe(200);
        expect(reviewResponse?.headers()["cache-control"]).toMatch(
          /private|no-store/u,
        );
        const stateSelect = page.locator('select[name="state"]');
        await expect
          .soft(stateSelect)
          .not.toHaveAccessibleName(m.AiDraftReview.proposed);
        await expect
          .soft(page.locator('input[name="dueBefore"]'))
          .toHaveAccessibleDescription(/time zone|時區/u);
        await page.screenshot({
          path:
            root +
            locale +
            (origin.startsWith("https:") ? "-preview" : "") +
            "-review-" +
            (process.env.FULL_FIX_UI_PHASE ?? "after") +
            "-mobile.png",
          fullPage: true,
        });
        checks.push({
          locale,
          reviewFirstActionMs: Date.now() - loadStart,
          firstActionTargetMs: 3000,
          measurementIncludesNetworkAuthDbAndBrowser: true,
          performanceGateVerified: false,
        });
        const menu = page.getByRole("button", {
          name: m.Admin.shell.menu,
          exact: true,
        });
        await menu.focus();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("dialog")).toBeVisible();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Escape");
        await expect(page.getByRole("dialog")).not.toBeVisible();
        await expect(menu).toBeFocused();
        for (const width of [1440, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const axe = await new AxeBuilder({ page }).analyze();
          expect(
            axe.violations.filter((v) =>
              ["serious", "critical"].includes(v.impact ?? ""),
            ),
          ).toEqual([]);
          await stateSelect.focus();
          await page.keyboard.press("Tab");
          await expect(page.locator('input[name="ownerId"]')).toBeFocused();
          await page.keyboard.press("Shift+Tab");
          await expect(stateSelect).toBeFocused();
          await page.screenshot({
            path:
              root +
              locale +
              (origin.startsWith("https:") ? "-preview" : "") +
              "-review-" +
              width +
              ".png",
            fullPage: true,
          });
          checks.push({
            locale,
            width,
            axeSeriousCritical: 0,
            actualPasswordAuth: true,
            keyboardOrderVerified: true,
            drawerEscFocusReturnVerified: true,
            tableKeyboardScrollVerified: true,
          });
        }
        const network = await page.context().newCDPSession(page);
        for (let run = 0; run < 3; run++)
          for (const browserCache of ["cleared", "warm"]) {
            if (browserCache === "cleared")
              await network.send("Network.clearBrowserCache");
            const start = Date.now();
            await page.goto(origin + prefix + "/admin/ai-review");
            await expect(
              page.getByRole("button", {
                name: m.AiDraftReview.applyFilters,
                exact: true,
              }),
            ).toBeEnabled();
            const firstActionMs = Date.now() - start;
            const navigation = await page.evaluate(() => {
              const p = performance.getEntriesByType(
                "navigation",
              )[0] as PerformanceNavigationTiming;
              return {
                ttfbMs: p.responseStart - p.requestStart,
                dnsMs: p.domainLookupEnd - p.domainLookupStart,
                tlsMs: p.secureConnectionStart
                  ? p.connectEnd - p.secureConnectionStart
                  : 0,
                transferBytes: p.transferSize,
                encodedBodyBytes: p.encodedBodySize,
              };
            });
            checks.push({
              locale,
              run,
              browserCache,
              firstActionMs,
              targetMs: 3000,
              ...navigation,
              network:
                "unthrottled desktop automation; locality not established",
              databaseAndAppCache: "not flushed",
              labOnly: true,
            });
            if (!origin.startsWith("https:"))
              expect(
                firstActionMs,
                "local same-environment first actionable screen target",
              ).toBeLessThanOrEqual(3000);
          }
        await network.detach();
        await signInForM2(page, "member");
        await page.goto(origin + prefix + "/admin/ai-review");
        await expect(
          page.getByRole("heading", {
            name: m.AdminLogin.accessDenied,
            exact: true,
          }),
        ).toBeVisible();
        await expect(page.locator('select[name="state"]')).toHaveCount(0);
        checks.push({
          locale,
          sameBrowserPreviousStaffDataHidden: true,
          actualSecondAuthIdentity: true,
        });
      },
    );
});
