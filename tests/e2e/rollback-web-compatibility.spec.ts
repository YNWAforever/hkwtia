import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { test, expect } from "@playwright/test";
import { signInForM2 } from "../fixtures/m2-auth";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "../../scripts/lib/acceptance-guard";
const evidence = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t16/";
const labels = JSON.parse(readFileSync("messages/en.json", "utf8")).Admin
  .pageCopy;
let pool: Pool;
test.use({ trace: "off", video: "off" });
test.describe("exact historical web against additive schema", () => {
  test.skip(
    process.env.FULL_FIX_ROLLBACK_ACCEPTANCE !== "1",
    "BLOCKED: owned historical build/runtime proof and isolated Auth required",
  );
  test.beforeAll(async () => {
    expect(process.env.PLAYWRIGHT_BASE_URL).toBe("http://localhost:3450");
    const db = assertIsolatedSeedEnvironment(process.env, {
      prefix: "FULL_REMEDIATION",
      flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
      hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
    });
    expect(db).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(db).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    pool = new Pool({ connectionString: db, query_timeout: 15000 });
    await assertSeedSentinel("FULL_REMEDIATION", async () =>
      Number(
        (await pool.query("SELECT count(*) n FROM acceptance_sentinel")).rows[0]
          .n,
      ),
    );
    expect(
      JSON.parse(
        readFileSync(
          ".playwright/full-fix-t16-historical-runtime.json",
          "utf8",
        ),
      ),
    ).toMatchObject({
      appSha: "36ebae1dac68a7e0e420870cf0df68fa166b7874",
      buildExit: 0,
      positiveRuntimeDb: true,
      ledger: 61,
      production: false,
    });
    mkdirSync(evidence, { recursive: true });
  });
  test.afterAll(async () => pool?.end());
  for (const locale of ["en", "zh-HK"] as const)
    test(`${locale} historical authenticated member list reads current schema`, async ({
      page,
    }) => {
      await signInForM2(page, "staff");
      await page.setViewportSize({
        width: locale === "en" ? 1440 : 390,
        height: 900,
      });
      const response = await page.goto(
        (locale === "zh-HK" ? "/zh" : "") + "/admin/members",
      );
      expect(response?.status()).toBe(200);
      expect(response?.headers()["cache-control"]).toContain("private");
      await expect(page.locator("main table")).toBeVisible();
      expect(await page.locator("main tbody tr").count()).toBeGreaterThan(0);
      await page.screenshot({
        path: evidence + `historical-${locale}-members.png`,
      });
    });
  test("historical server actions save private copy, publish, restore publication and preserve audit", async ({
    page,
    browser,
  }) => {
    await signInForM2(page, "staff");
    const session = await (
      await page.request.get("/api/auth/get-session")
    ).json();
    expect(typeof session.user.id).toBe("string");
    const profile = (
      await pool.query("SELECT id,role FROM profiles WHERE auth_user_id=$1", [
        session.user.id,
      ])
    ).rows;
    expect(profile).toHaveLength(1);
    expect(profile[0].role).toBe("staff");
    const owner = profile[0].id as string;
    expect(
      (
        await pool.query(
          "SELECT id FROM page_copy_drafts WHERE owner_profile_id=$1 AND namespace='About' AND published_at IS NULL",
          [owner],
        )
      ).rows,
    ).toHaveLength(0);
    const before = (
      await pool.query(
        "SELECT locale,key_path,value FROM page_copy WHERE namespace='About' ORDER BY locale,key_path",
      )
    ).rows;
    const anonymousContext = await browser.newContext();
    const anonymous = await anonymousContext.newPage();
    const marker = "Synthetic historical CMS " + randomUUID();
    try {
      await anonymous.goto("/about");
      const original = await anonymous.locator("main h1").innerText();
      await page.goto("/admin/page-copy/About");
      const block=page.getByRole("combobox", { name: labels.workspace.block, exact: true });
      await expect(block).toBeVisible();
      const options=await block.locator("option").evaluateAll(nodes=>nodes.map(node=>(node as HTMLOptionElement).value));
      writeFileSync(evidence+"historical-cms-options.json",JSON.stringify({namespace:"About",options,production:false},null,2));
      expect(options).toContain("title");
      await block.selectOption("title");
      await page.locator('textarea[name="copy:en:title"]').fill(marker);
      await page
        .locator('textarea[name="copy:zh-HK:title"]')
        .fill("合成歷史版本文案 " + marker);
      await page
        .getByRole("button", { name: labels.serverDraft.save, exact: true })
        .click();
      await expect(
        page.getByText(labels.serverDraft.saved, { exact: true }),
      ).toBeVisible();
      const draft = (
        await pool.query(
          "SELECT id FROM page_copy_drafts WHERE owner_profile_id=$1 AND namespace='About' AND published_at IS NULL",
          [owner],
        )
      ).rows;
      expect(draft).toHaveLength(1);
      await anonymous.goto("/about");
      await expect(anonymous.locator("main h1")).toHaveText(original);
      await page
        .getByRole("button", { name: labels.serverDraft.publish, exact: true })
        .click();
      await expect(
        page.getByText(labels.serverDraft.published, { exact: true }),
      ).toBeVisible();
      await anonymous.goto("/about");
      await expect(anonymous.locator("main h1")).toHaveText(marker);
      await page.goto("/admin/page-copy/About");
      await page
        .getByRole("checkbox", {
          name: labels.serverDraft.previousCopy,
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: labels.serverDraft.restore, exact: true })
        .click();
      await expect(
        page.getByText(labels.serverDraft.restored, { exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: labels.serverDraft.publish, exact: true })
        .click();
      await expect(
        page.getByText(labels.serverDraft.published, { exact: true }),
      ).toBeVisible();
      await anonymous.goto("/about");
      await expect(anonymous.locator("main h1")).toHaveText(original);
      expect(
        (
          await pool.query(
            "SELECT locale,key_path,value FROM page_copy WHERE namespace='About' ORDER BY locale,key_path",
          )
        ).rows,
      ).toEqual(before);
      expect(
        (
          await pool.query(
            "SELECT count(*)::int n FROM audit_events WHERE target_id=$1 AND action='page_copy.published'",
            [draft[0].id],
          )
        ).rows[0].n,
      ).toBe(1);
      await page.screenshot({ path: evidence + "historical-cms-restored.png" });
      writeFileSync(
        evidence + "/historical-cms.json",
        JSON.stringify(
          {
            appSha: "36ebae1dac68a7e0e420870cf0df68fa166b7874",
            ledger: 61,
            realPasswordAuth: true,
            serverActorMatchedAuthId: true,
            privateSave: true,
            publish: true,
            restorePublication: true,
            publicProjectionRestored: true,
            publicationAuditRetained: true,
            originalProjectionSha256: createHash("sha256")
              .update(JSON.stringify(before))
              .digest("hex"),
            providerSends: 0,
            externalModelCalls: 0,
            production: false,
          },
          null,
          2,
        ),
      );
    } finally {
      await anonymousContext.close();
    }
  });
});
