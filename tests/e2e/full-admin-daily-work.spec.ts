import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { signInForM2 } from "../fixtures/m2-auth";
const run = randomUUID(),
  company = randomUUID(),
  application = randomUUID(),
  membership = randomUUID();
const profile = "synthetic-daily-" + run,
  name = "Synthetic daily " + run;
let pool: Pool, staffId: string;
const evidence = "docs/audits/hkwtia-2026-10-01-remediation/evidence/t18/";
test.use({ trace: "off", video: "off", actionTimeout: 30000 });
test.describe("actual isolated daily workspace", () => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true",
    "Confirmed isolated DB/Auth required",
  );
  test.beforeAll(async ({ browser, baseURL }) => {
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
    expect(process.env.M2_TEST_STAFF_EMAIL).toMatch(/@.*example\.test$/);
    pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
    expect(
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    ).toBe(1);
    const context = await browser.newContext(),
      page = await context.newPage();
    try {
      await signInForM2(page, "staff");
      const session = await page.request.get("/api/auth/get-session");
      expect(session.ok()).toBe(true);
      const identity = (await session.json()).user.id;
      staffId = (
        await pool.query(
          "SELECT id FROM profiles WHERE auth_user_id=$1 AND role='staff'",
          [identity],
        )
      ).rows[0].id;
    } finally {
      await context.close();
    }
    await pool.query(
      "INSERT INTO companies(id,legal_name,display_name,directory_visible) VALUES($1,$2,$2,false)",
      [company, name + " company"],
    );
    await pool.query(
      "INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,$3,'member')",
      [profile, run + "@example.test", name],
    );
    await pool.query(
      "INSERT INTO company_members(company_id,user_id) VALUES($1,$2)",
      [company, profile],
    );
    await pool.query(
      "INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'community','pending_payment')",
      [application, profile],
    );
    await pool.query(
      "INSERT INTO memberships(id,company_id,application_id,plan_code,status,seat_limit,stripe_customer_id) VALUES($1,$2,$3,'corporate','pending_payment',10,'cus_synthetic_daily')",
      [membership, company, application],
    );
    await pool.query(
      "INSERT INTO billing_attempts(membership_id,attempt_number,idempotency_key,price_reference,state) VALUES($1,1,$2,'synthetic-price','completed')",
      [membership, "synthetic-daily-" + run],
    );
    await pool.query(
      "INSERT INTO staff_tasks(profile_id,kind,dedupe_key,summary_code,context) VALUES($1,'membership_application',$2,'await_documents',$3::jsonb)",
      [
        profile,
        "membership-application:" + application,
        JSON.stringify({
          applicationId: application,
          caseVersion: randomUUID(),
          ownerProfileId: staffId,
          dueAt: "2026-09-01T00:00:00Z",
          missingFields: [],
          nextActionCode: "await_documents",
        }),
      ],
    );
    mkdirSync(evidence, { recursive: true });
  });
  test.afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM staff_tasks WHERE dedupe_key=$1", [
      "membership-application:" + application,
    ]);
    await pool.query("DELETE FROM billing_attempts WHERE membership_id=$1", [
      membership,
    ]);
    await pool.query("DELETE FROM memberships WHERE id=$1", [membership]);
    await pool.query("DELETE FROM membership_applications WHERE id=$1", [
      application,
    ]);
    await pool.query("DELETE FROM profiles WHERE id=$1", [profile]);
    await pool.query("DELETE FROM companies WHERE id=$1", [company]);
    await pool.end();
  });
  for (const locale of ["en", "zh-HK"] as const)
    test(
      locale + " scope, company keyboard, history and Member360 facts",
      async ({ page, baseURL }) => {
        const prefix = locale === "en" ? "" : "/zh",
          copy = JSON.parse(
            readFileSync("messages/" + locale + ".json", "utf8"),
          ).Admin;
        await signInForM2(page, "staff");
        await page
          .context()
          .addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
        const viewports: number[] = [],
          axeReceipts: unknown[] = [];
        async function accessibility(surface: string) {
          const result = await new AxeBuilder({ page })
            .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
            .analyze();
          expect(result.passes.length).toBeGreaterThan(5);
          if(result.violations.length)writeFileSync(".playwright/t18-axe-"+locale+"-"+surface+".json",JSON.stringify(result.violations.map(({id,impact,nodes})=>({id,impact,nodes:nodes.map(({target,html,failureSummary})=>({target,html,failureSummary}))})),null,2));
          expect(
            result.violations.map(({ id, impact, nodes }) => ({
              id,
              impact,
              count: nodes.length,
            })),
          ).toEqual([]);
          axeReceipts.push({
            surface,
            passedRules: result.passes.length,
            violations: 0,
            incompleteRules: result.incomplete.map(({ id }) => id),
          });
        }

        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 });
          const response = await page.goto(prefix + "/admin");
          expect(response!.status()).toBe(200);
          await expect(page.locator("#daily-work-heading")).toHaveText(
            copy.workQueue.title,
          );
          await expect(
            page
              .locator('section[aria-labelledby="daily-work-heading"]')
              .getByText(name, { exact: true }),
          ).toBeVisible();
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth),
          ).toBeLessThanOrEqual(width);
          if (width === 1440) {
            const nav = page
              .getByTestId("admin-desktop-sidebar")
              .getByRole("navigation");
            expect(await nav.locator("a svg").count()).toBe(25);
            for (const group of Object.values(copy.navigation.groups))
              await expect(
                nav.getByText(group as string, { exact: true }),
              ).toBeVisible();
          } else {
            const trigger = page.getByRole("button", {
              name: copy.shell.menu,
              exact: true,
            });
            await trigger.focus();
            await page.keyboard.press("Enter");
            const dialog = page.getByRole("dialog");
            await expect(dialog).toBeVisible();
            expect(await dialog.locator("a svg").count()).toBe(25);
            await accessibility("drawer-" + width);
            for (let i = 0; i < 30; i++) {
              await page.keyboard.press("Tab");
              expect(
                await dialog.evaluate((node) =>
                  node.contains(document.activeElement),
                ),
              ).toBe(true);
            }
            await page.keyboard.press("Escape");
            await expect(dialog).not.toBeVisible();
            await expect(trigger).toBeFocused();
          }
          await accessibility("dashboard-" + width);
          await page.screenshot({
            path: evidence + locale + "-dashboard-" + width + ".png",
          });
          viewports.push(width);
        }
        const work = page.locator(
          'section[aria-labelledby="daily-work-heading"]',
        );
        await work
          .getByRole("link", { name: copy.workQueue.unassigned, exact: true })
          .click();
        await expect(page).toHaveURL(/workScope=unassigned/);
        await expect(work.getByText(name, { exact: true })).toHaveCount(0);
        await work
          .getByRole("link", { name: copy.workQueue.mine, exact: true })
          .click();
        await expect(work.getByText(name, { exact: true })).toBeVisible();
        await work
          .getByRole("link", {
            name: copy.workQueue.actions.support_reconciliation,
            exact: true,
          })
          .first()
          .click();
        await expect(page).toHaveURL(
          new RegExp("/admin/members/queue/" + application),
        );
        await page.goto(prefix + "/admin/members");
        await expect(
          page.getByText(copy.members.filters.advanced, { exact: true }),
        ).toBeVisible();
        const advanced = page.locator("details").filter({
          has: page.getByText(copy.members.filters.advanced, { exact: true }),
        });
        await expect(advanced).not.toHaveAttribute("open", "");
        await advanced.locator("summary").click();
        const picker = page.getByRole("combobox", {
          name: copy.members.filters.companyId,
          exact: true,
        });
        await picker.fill(name + " company");
        await expect(
          page.getByRole("option", { name: name + " company", exact: true }),
        ).toBeVisible();
        await picker.press("ArrowDown");
        await picker.press("Enter");
        await expect(page.locator('input[name="companyId"]')).toHaveValue(
          company,
        );
        await page
          .getByRole("button", {
            name: copy.members.filters.apply,
            exact: true,
          })
          .click();
        await expect(page).toHaveURL(new RegExp("companyId=" + company));
        await expect(
          page.getByRole("rowheader", { name, exact: true }),
        ).toBeVisible();
        const filtered = page.url();
        const detail = page.getByRole("link", { name, exact: true });
        await expect(detail).toHaveCount(1);
        await detail.click();
        await expect(page.locator("#member-maintenance-heading")).toHaveText(
          copy.memberMaintenance.title,
        );
        const summary = page.locator(
          'section[aria-labelledby="member-maintenance-heading"]',
        );
        await expect(
          summary.getByText(copy.memberMaintenance.paymentStates.completed, {
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          summary.getByText(copy.members.statusCodes.pending_payment, {
            exact: true,
          }),
        ).toBeVisible();
        const identifiers = page.locator("details").filter({
          has: page.getByText(copy.memberMaintenance.billingDetails, {
            exact: true,
          }),
        });
        await expect(identifiers).toHaveCount(1);
        await expect(identifiers).not.toHaveAttribute("open", "");
        await accessibility("member360-390");
        await page.screenshot({
          path: evidence + locale + "-member360-390.png",
        });
        await page.goBack();
        await expect(page).toHaveURL(filtered);
        await expect(
          page.getByRole("rowheader", { name, exact: true }),
        ).toBeVisible();
        if (!(await advanced.evaluate((node) => node.hasAttribute("open"))))
          await advanced.locator("summary").click();
        await expect(picker).toHaveValue(name + " company");
        await accessibility("company-filter-390");
        await page.screenshot({
          path: evidence + locale + "-company-keyboard-390.png",
        });
        expect(
          (
            await pool.query("SELECT status FROM memberships WHERE id=$1", [
              membership,
            ])
          ).rows,
        ).toEqual([{ status: "pending_payment" }]);
        expect(
          (
            await pool.query(
              "SELECT state FROM billing_attempts WHERE membership_id=$1",
              [membership],
            )
          ).rows,
        ).toEqual([{ state: "completed" }]);
        writeFileSync(
          evidence + locale + "-browser.json",
          JSON.stringify(
            {
              environment:
                "confirmed isolated Neon/Auth; actual built Chromium",
              locale,
              viewports,
              axe: axeReceipts,
              scope: "mine/unassigned and actual case deep link",
              navigation: {
                groups: 6,
                links: 25,
                svgIcons: 25,
                drawerTabTrap: true,
                escapeFocusReturn: true,
              },
              company:
                "private registered name, ArrowDown/Enter selection, GET UUID retained, Browser Back",
              member360:
                "stored subject link, membership pending_payment, completed attempt independently displayed",
              effects:
                "synthetic fixture insertion and exact fixture cleanup only; no rights/provider mutation",
              fixtureReference: createHash("sha256")
                .update(run)
                .digest("hex")
                .slice(0, 16),
              production: false,
            },
            null,
            2,
          ),
        );
      },
    );
});
