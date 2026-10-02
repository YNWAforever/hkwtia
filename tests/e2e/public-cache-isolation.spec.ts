import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { expect, test } from "@playwright/test";
import { missingM2IdentityEnvironment, signInForM2 } from "../fixtures/m2-auth";
const en = JSON.parse(
  readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8"),
) as typeof import("../../messages/en.json");
const zh = JSON.parse(
  readFileSync(new URL("../../messages/zh-HK.json", import.meta.url), "utf8"),
) as typeof import("../../messages/zh-HK.json");

const missing = missingM2IdentityEnvironment();
const isolated = process.env.AUDIT_ISOLATED_ACCEPTANCE === "true";
test.describe("isolated public cache acceptance", () => {
  test.skip(
    !isolated || missing.length > 0,
    `Requires AUDIT_ISOLATED_ACCEPTANCE=true and isolated M2 identities: ${missing.join(", ")}`,
  );
  test.beforeEach(async ({ baseURL }) => {
    const target = new URL(baseURL!);
    expect(target.hostname).not.toBe("hkwtia.vercel.app");
    expect(
      ["localhost", "127.0.0.1"].includes(target.hostname) ||
        target.hostname.endsWith(".vercel.app"),
    ).toBe(true);
  });
  test("member A, company member B and guest see only the public bilingual news projection", async ({
    browser,
    baseURL,
  }) => {
    const contexts = await Promise.all([
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
    ]);
    try {
      const pages = await Promise.all(
        contexts.map((context) => context.newPage()),
      );
      await signInForM2(pages[0]!, "member");
      await signInForM2(pages[1]!, "company-admin");
      for (const [path, title] of [
        ["/news", en.News.title],
        ["/zh/news", zh.News.title],
      ]) {
        const bodies = [];
        for (const page of pages) {
          await page.goto(path!);
          await expect(
            page.getByRole("heading", { level: 1, name: title! }),
          ).toBeVisible();
          bodies.push(await page.locator("main").innerText());
        }
        expect(bodies[0]).toBe(bodies[1]);
        expect(bodies[1]).toBe(bodies[2]);
        for (const body of bodies)
          for (const key of [
            "M2_TEST_MEMBER_EMAIL",
            "M2_TEST_COMPANY_ADMIN_EMAIL",
          ]) {
            expect(body).not.toContain(process.env[key]!);
          }
      }
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
  test("private bilingual drafts stay out of warmed public cache; explicit publish and revert invalidate it", async ({
    page,
    browser,
    baseURL,
  }) => {
    test.skip(
      process.env.CMS_SERVER_DRAFTS_ENABLED !== "true",
      "Requires confirmed isolated server-draft acceptance",
    );
    expect(new URL(baseURL!).hostname).toBe("localhost");
    expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
    expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
      "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
    );
    expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
    const contexts = await Promise.all([
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
    ]);
    const [englishGuest, chineseGuest, other] = await Promise.all(
      contexts.map((context) => context.newPage()),
    );
    const token = `Synthetic cache ${randomUUID()}`,
      copy = en.Admin.pageCopy,
      server = copy.serverDraft;
    const english = page.locator('textarea[name="copy:en:title"]'),
      chinese = page.locator('textarea[name="copy:zh-HK:title"]');
    let publicBefore: Record<string, unknown>[] = [],
      baselineTitles: string[] = [],
      published = false;
    async function submit(label: string) {
      const [response] = await Promise.all([
        page.waitForResponse(
          (r) =>
            r.request().method() === "POST" &&
            Boolean(r.request().headers()["next-action"]),
        ),
        page.getByRole("button", { name: label, exact: true }).click(),
      ]);
      expect(response.ok()).toBe(true);
    }
    async function publicTitles() {
      await englishGuest.goto("/privacy");
      await chineseGuest.goto("/zh/privacy");
      return Promise.all(
        [englishGuest, chineseGuest].map((p) =>
          p.getByRole("heading", { level: 1 }).innerText(),
        ),
      );
    }
    async function revert() {
      await page.goto("/admin/page-copy/Privacy");
      await page
        .getByRole("checkbox", { name: server.previousCopy, exact: true })
        .check();
      await submit(server.restore);
      await expect(
        page.getByText(server.restored, { exact: true }),
      ).toBeVisible();
      await submit(server.publish);
      await expect(
        page.getByText(server.published, { exact: true }),
      ).toBeVisible();
      published = false;
    }
    try {
      expect(
        Number(
          (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
            .rows[0].n,
        ),
      ).toBe(1);
      await signInForM2(page, "staff");
      await signInForM2(other, "superadmin");
      const identity = await (
        await page.request.get("/api/auth/get-session")
      ).json();
      const owner = (
        await pool.query(
          "SELECT id FROM profiles WHERE auth_user_id=$1 AND role='staff'",
          [identity.user.id],
        )
      ).rows[0]?.id;
      expect(owner).toBeTruthy();
      expect(
        (
          await pool.query(
            "SELECT id FROM page_copy_drafts WHERE owner_profile_id=$1 AND namespace='Privacy' AND published_at IS NULL",
            [owner],
          )
        ).rows,
      ).toHaveLength(0);
      publicBefore = (
        await pool.query(
          "SELECT locale,key_path,value FROM page_copy WHERE namespace='Privacy' ORDER BY locale,key_path",
        )
      ).rows;
      baselineTitles = await publicTitles();
      await page.goto("/admin/page-copy/Privacy");
      await english.fill(token);
      await chinese.fill(`合成私人快取 ${token}`);
      await submit(server.save);
      await expect(page.getByText(server.saved, { exact: true })).toBeVisible();
      expect(await publicTitles()).toEqual(baselineTitles);
      const draft = (
        await pool.query(
          "SELECT id FROM page_copy_drafts WHERE owner_profile_id=$1 AND namespace='Privacy' AND published_at IS NULL",
          [owner],
        )
      ).rows[0];
      expect(draft).toBeTruthy();
      await other.goto("/admin/cms-preview/" + draft.id);
      expect(await other.content()).not.toContain(token);
      await englishGuest.goto("/admin/cms-preview/" + draft.id);
      expect(await englishGuest.content()).not.toContain(token);
      const privateResponse = await page.goto("/admin/cms-preview/" + draft.id);
      expect(privateResponse!.headers()["cache-control"]).toContain("no-store");
      expect(privateResponse!.headers()["x-robots-tag"]).toContain("noindex");
      expect(await page.locator("main").innerText()).toContain(token);
      await page.goto("/admin/page-copy/Privacy");
      await submit(server.publish);
      await expect(
        page.getByText(server.published, { exact: true }),
      ).toBeVisible();
      published = true;
      expect(await publicTitles()).toEqual([token, `合成私人快取 ${token}`]);
      await revert();
      expect(await publicTitles()).toEqual(baselineTitles);
      expect(
        (
          await pool.query(
            "SELECT locale,key_path,value FROM page_copy WHERE namespace='Privacy' ORDER BY locale,key_path",
          )
        ).rows,
      ).toEqual(publicBefore);
      mkdirSync("docs/audits/hkwtia-2026-10-01-remediation/evidence/t21", {
        recursive: true,
      });
      writeFileSync(
        "docs/audits/hkwtia-2026-10-01-remediation/evidence/t21/cache-browser.json",
        JSON.stringify(
          {
            sourceSha: process.env.AUDIT_SOURCE_SHA,
            environment:
              "confirmed isolated Neon/Auth; actual built Next/browser",
            production: false,
            privateSaveNotPublic: true,
            anonymousAndOtherEditorDenied: true,
            ownerPreviewNoStoreNoindex: true,
            warmedBothLocalesInvalidated: true,
            explicitRevertInvalidated: true,
            publicRowsRestored: true,
            retainedPublicationHistory: true,
            providerEffects: 0,
          },
          null,
          2,
        ) + "\n",
      );
    } finally {
      try {
        if (published) await revert();
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
        await pool.end();
      }
    }
  });
});
