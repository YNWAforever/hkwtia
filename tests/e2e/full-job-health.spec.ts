import fs from "node:fs";
import {expect, test} from "@playwright/test";
import {Pool} from "pg";
import {signInRemediationIdentity} from "../fixtures/full-remediation-browser";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard";
const evidence = "docs/audits/hkwtia-2026-10-01-remediation/evidence/t11/";
test.use({trace: "off", video: "off"});
test.describe("actual isolated worker health workspace", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1",
    "Confirmed isolated target required",
  );
  test.beforeAll(async ({baseURL}) => {
    const url = assertIsolatedSeedEnvironment(process.env, {
      prefix: "FULL_REMEDIATION",
      flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
      hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
    });
    expect(new URL(url).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
    expect(new URL(baseURL!).hostname).toBe("localhost");
    const pool = new Pool({connectionString: url});
    try {
      await assertSeedSentinel("FULL_REMEDIATION", async () =>
        Number(
          (
            await pool.query(
              "SELECT count(*) AS count FROM acceptance_sentinel",
            )
          ).rows[0].count,
        ),
      );
    } finally {
      await pool.end();
    }
    fs.mkdirSync(evidence, {recursive: true});
  });
  for (const locale of ["zh-HK", "en"] as const)
    test(
      locale + " presents unknown/disabled/verified polling separately",
      async ({page, context, baseURL}) => {
        await signInRemediationIdentity(context, baseURL!, "STAFF");
        await context.addCookies([
          {name: "NEXT_LOCALE", value: locale, url: baseURL!},
        ]);
        await page.setViewportSize({
          width: locale === "en" ? 390 : 1440,
          height: 960,
        });
        const response = await page.goto(
          (locale === "en" ? "" : "/zh") + "/admin/automations",
        );
        expect(response?.status()).toBe(200);
        const h = JSON.parse(
          fs.readFileSync("messages/" + locale + ".json", "utf8"),
        ).Admin.jobHealth;
        await expect(
          page.getByRole("heading", {name: h.heading}),
        ).toBeVisible();
        const region = page.getByRole("group", {name: h.heading});
        await region.focus();
        expect(
          await region.evaluate(
            (element) => element === document.activeElement,
          ),
        ).toBe(true);
        const row = region
          .getByRole("row")
          .filter({
            has: page.getByRole("rowheader", {
              name: h.jobs["rate-limit-cleanup"],
              exact: true,
            }),
          });
        const state = process.env.HEALTH_EXPECTED_STATE ?? "unknown";
        expect(["unknown", "healthy", "degraded"]).toContain(state);
        await expect(
          row.getByText(h.states[state], {exact: true}),
        ).toBeVisible();
        if (state === "healthy" || state === "degraded") {
          await expect(row.getByRole("cell").nth(6)).toHaveText(
            state === "healthy" ? "0" : "1",
          );
          await expect(
            row
              .getByRole("cell")
              .nth(7)
              .getByText("a".repeat(12), {exact: true}),
          ).toBeVisible();
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await row.scrollIntoViewIfNeeded();
        await page.screenshot({
          path: evidence + locale + "-health-" + state + ".png",
        });
        fs.writeFileSync(
          evidence + locale + "-health-" + state + ".json",
          JSON.stringify(
            {
              environment: "confirmed isolated DB/Auth; Chromium",
              locale,
              viewport: locale === "en" ? 390 : 1440,
              http: 200,
              keyboardScrollableRegion: true,
              rateLimitHealth: state,
              cloudWorkerDeploymentVerified: false,
              production: false,
            },
            null,
            2,
          ),
        );
      },
    );
});
