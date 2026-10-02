import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import { signInForM2 } from "../fixtures/m2-auth";
const en = JSON.parse(
  readFileSync("messages/en.json", "utf8"),
) as typeof import("../../messages/en.json");
const zh = JSON.parse(
  readFileSync("messages/zh-HK.json", "utf8"),
) as typeof import("../../messages/zh-HK.json");
test.use({ trace: "off", video: "off", channel: "chromium" });
test("private bilingual CMS draft, real layout, second editor conflict and explicit publication revert", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true" ||
      process.env.CMS_SERVER_DRAFTS_ENABLED !== "true",
    "Requires explicitly enabled confirmed isolated CMS acceptance",
  );
  expect(new URL(baseURL!).hostname).toBe("localhost");
  expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
  expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
    "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
  );
  expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
  for (const prefix of ["M2_TEST_STAFF", "M2_TEST_SUPERADMIN"])
    expect(process.env[prefix + "_EMAIL"]).toMatch(
      /@([a-z0-9-]+\.)*example\.test$/i,
    );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
  const run = "Synthetic CMS " + randomUUID(),
    hash = (value: string) =>
      createHash("sha256").update(value).digest("hex").slice(0, 16);
  writeFileSync(".playwright/t22-cms-setup-safe.json",JSON.stringify({stage:"before-contexts"}));
  const contexts = await Promise.all([
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
    browser.newContext(),
  ]);
  writeFileSync(".playwright/t22-cms-setup-safe.json",JSON.stringify({stage:"contexts-created"}));
  const [staff, other, anonymous, device] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const copy = en.Admin.pageCopy,
    server = copy.serverDraft;
  const checkpoints: string[] = [];
  const checkpoint = (stage: string) => { checkpoints.push(stage); writeFileSync(".playwright/t22-cms-steps-safe.json", JSON.stringify({stages: checkpoints})); };
  const facts: Record<string, unknown> = {
    scope:
      "confirmed isolated Neon/Auth; synthetic identities; actual built Next/browser/repository",
    production: false,
    run,
  };
  async function submit(page: Page, label: string) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          Boolean(response.request().headers()["next-action"]),
      ),
      page.getByRole("button", { name: label, exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);
  }
  async function editor(page: Page, prefix = "") {
    await page.goto(prefix + "/admin/page-copy/Home");
    await page
      .getByRole("combobox", {
        name: prefix ? zh.Admin.pageCopy.workspace.block : copy.workspace.block,
        exact: true,
      })
      .selectOption("hero");
  }
  async function own(profileId: string) {
    return (
      await pool.query(
        "SELECT id,revision,base_revision,entries FROM page_copy_drafts WHERE owner_profile_id=$1 AND namespace='Home' AND published_at IS NULL",
        [profileId],
      )
    ).rows[0];
  }
  try {
    expect(
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    ).toBe(1);
    expect(
      Number(
        (
          await pool.query(
            "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
          )
        ).rows[0].n,
      ),
    ).toBe(56);
    checkpoint("staff-login");
    await signInForM2(staff, "staff");
    await signInForM2(other, "superadmin");
    const identities = await Promise.all(
      [staff, other].map(async (page) => {
        const response = await page.request.get("/api/auth/get-session");
        expect(response.ok()).toBe(true);
        const data = await response.json();
        expect(typeof data.user?.id).toBe("string");
        return data.user.id as string;
      }),
    );
    const profileIds = (
      await pool.query(
        "SELECT id,role FROM profiles WHERE auth_user_id IN ($1,$2)",
        identities,
      )
    ).rows;
    expect(profileIds).toHaveLength(2);
    const staffId = profileIds.find((row) => row.role === "staff")!.id,
      otherId = profileIds.find((row) => row.role === "superadmin")!.id;
    checkpoint("identities-linked");
    // Never overwrite another test/operator's open server draft.
    expect(await own(staffId)).toBeUndefined();
    expect(await own(otherId)).toBeUndefined();
    checkpoint("drafts-empty");
    const publicBefore = (
      await pool.query(
        "SELECT locale,key_path,value FROM page_copy WHERE namespace='Home' ORDER BY locale,key_path",
      )
    ).rows;
    await anonymous.goto("/");
    const original = await anonymous.locator("#hero-title").innerText();
    checkpoint("open-editor");
    await editor(staff);
    expect(await staff.locator("textarea").count()).toBeLessThanOrEqual(40);
    await staff.locator('textarea[name="copy:en:hero.title"]').fill(run);
    await staff
      .locator('textarea[name="copy:zh-HK:hero.title"]')
      .fill("合成私人文案 " + run);
    checkpoint("private-save");
    await submit(staff, server.save);
    await expect(staff.getByText(server.saved, { exact: true })).toBeVisible();
    await expect(
      staff.getByRole("combobox", { name: copy.workspace.block, exact: true }),
    ).toHaveValue("hero");
    const privateDraft = await own(staffId);
    expect(privateDraft).toBeTruthy();
    facts.draftReference = hash(privateDraft.id);
    await anonymous.goto("/");
    await expect(anonymous.locator("#hero-title")).toHaveText(original);
    expect(
      (
        await pool.query(
          "SELECT locale,key_path,value FROM page_copy WHERE namespace='Home' ORDER BY locale,key_path",
        )
      ).rows,
    ).toEqual(publicBefore);
    await signInForM2(device, "staff");
    await editor(device, "/zh");
    await expect(
      device.locator('textarea[name="copy:en:hero.title"]'),
    ).toHaveValue(run);
    checkpoint("other-editor");
    await editor(other);
    await other
      .locator('textarea[name="copy:en:hero.title"]')
      .fill(run + " other editor");
    await submit(other, server.save);
    const otherDraft = await own(otherId);
    await other.goto("/admin/cms-preview/" + privateDraft.id);
    await expect(other.locator("#hero-title")).toHaveCount(0);
    expect(await other.content()).not.toContain(run);
    await anonymous.goto("/admin/cms-preview/" + privateDraft.id);
    await expect(anonymous.locator("#hero-title")).toHaveCount(0);
    expect(await anonymous.content()).not.toContain(run);
    await editor(other);
    checkpoint("preview-layout");
    for (const [prefix, locale, width] of [
      ["", "en", 1440],
      ["/zh", "zh-HK", 390],
    ] as const) {
      await device
        .context()
        .addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await device.setViewportSize({ width, height: 900 });
      const response = await device.goto(
        prefix + "/admin/cms-preview/" + privateDraft.id,
      );
      expect(response!.headers()["cache-control"]).toContain("no-store");
      expect(response!.headers()["x-robots-tag"]).toContain("noindex");
      await expect(device.locator("#hero-title")).toHaveText(
        locale === "en" ? run : "合成私人文案 " + run,
      );
      await expect(device.locator(".hero img")).toBeVisible();
      await expect(device.locator("#pathways-title")).toBeVisible();
      expect(
        await device.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await device.locator("#legacy-network-title").scrollIntoViewIfNeeded();
      await device.evaluate(() => window.scrollTo(0, 0));
      await device.screenshot({
        path: `.playwright/t17-preview-${locale}.png`,
        fullPage: true,
      });
      await device.screenshot({
        path: `.playwright/t17-preview-${locale}-viewport.png`,
      });
    }
    await staff.evaluate(() => window.scrollTo(0, 0));
    await staff.screenshot({
      path: ".playwright/t17-editor-en-desktop.png",
      fullPage: true,
    });
    await staff.setViewportSize({ width: 390, height: 844 });
    expect(
      await staff.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await staff.evaluate(() => window.scrollTo(0, 0));
    await staff.screenshot({
      path: ".playwright/t17-editor-en-mobile.png",
      fullPage: true,
    });
    await staff.screenshot({
      path: ".playwright/t17-editor-en-mobile-viewport.png",
    });
    checkpoint("keyboard-publish");
    // Actual keyboard activation of the separate publish button.
    const publish = staff.getByRole("button", {
      name: server.publish,
      exact: true,
    });
    await publish.focus();
    await staff.keyboard.press("Space");
    await expect(
      staff.getByText(server.published, { exact: true }),
    ).toBeVisible();
    await anonymous.goto("/");
    await expect(anonymous.locator("#hero-title")).toHaveText(run);
    await submit(other, server.publish);
    await expect(
      other.getByText(copy.editConflict, { exact: true }),
    ).toBeVisible();
    expect((await own(otherId)).id).toBe(otherDraft.id);
    await anonymous.goto("/");
    await expect(anonymous.locator("#hero-title")).toHaveText(run);
    await editor(staff);
    await staff
      .getByRole("checkbox", { name: server.previousCopy, exact: true })
      .check();
    checkpoint("publication-revert");
    await submit(staff, server.restore);
    await expect(
      staff.getByText(server.restored, { exact: true }),
    ).toBeVisible();
    await anonymous.goto("/");
    await expect(anonymous.locator("#hero-title")).toHaveText(run);
    await submit(staff, server.publish);
    await expect(
      staff.getByText(server.published, { exact: true }),
    ).toBeVisible();
    await anonymous.goto("/");
    await expect(anonymous.locator("#hero-title")).toHaveText(original);
    expect(
      (
        await pool.query(
          "SELECT locale,key_path,value FROM page_copy WHERE namespace='Home' ORDER BY locale,key_path",
        )
      ).rows,
    ).toEqual(publicBefore);
    const history = (
      await pool.query(
        "SELECT id FROM page_copy_drafts WHERE owner_profile_id=$1 AND namespace='Home' AND published_at IS NOT NULL ORDER BY publication_sequence DESC LIMIT 2",
        [staffId],
      )
    ).rows;
    expect(history).toHaveLength(2);
    const publicationAudits = (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE target_id=ANY($1::text[]) AND action='page_copy.published'",
        [history.map((row) => row.id)],
      )
    ).rows[0].n;
    expect(publicationAudits).toBe(2);
    // Release the other editor's synthetic fixture through explicit private rebase
    // and publication of original copy; no row/history deletion or raw DB write.
    await editor(other);
    await other
      .locator('textarea[name="copy:en:hero.title"]')
      .fill(
        publicBefore.find(
          (row) => row.locale === "en" && row.key_path === "hero.title",
        )?.value ?? "",
      );
    await other
      .locator('textarea[name="copy:zh-HK:hero.title"]')
      .fill(
        publicBefore.find(
          (row) => row.locale === "zh-HK" && row.key_path === "hero.title",
        )?.value ?? "",
      );
    await submit(other, server.rebase);
    await expect(other.getByText(server.saved, { exact: true })).toBeVisible();
    await submit(other, server.publish);
    await expect(
      other.getByText(server.published, { exact: true }),
    ).toBeVisible();
    expect(
      (
        await pool.query(
          "SELECT locale,key_path,value FROM page_copy WHERE namespace='Home' ORDER BY locale,key_path",
        )
      ).rows,
    ).toEqual(publicBefore);
    facts.results = {
      privateSave: true,
      crossDevice: true,
      anonymousAndOtherEditorDenied: true,
      realLayoutEnZh: true,
      privateNoStore: true,
      explicitKeyboardPublish: true,
      secondEditorConflict: true,
      privateRestoreBeforePublish: true,
      publishedRevert: true,
      publicCopyRestored: true,
      publishedAudits: 2,
      syntheticOtherDraftRetired: true,
    };
    mkdirSync("docs/audits/hkwtia-2026-10-01-remediation/evidence/t17", {
      recursive: true,
    });
    writeFileSync(
      "docs/audits/hkwtia-2026-10-01-remediation/evidence/t17/browser.json",
      JSON.stringify(facts, null, 2),
    );
  } finally {
    checkpoint("cleanup");
    await Promise.all(contexts.map((context) => context.close()));
    await pool.end();
  }
});

test.describe("native media picker", () => {
  test("registered media search over 79 real static fixture images in bilingual event forms", async ({
  browser,
  baseURL,
}) => {
  test.skip(
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true",
    "Requires confirmed isolated acceptance",
  );
  expect(new URL(baseURL!).hostname).toBe("localhost");
  expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
  expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
    "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
  );
  expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
  expect(process.env.M2_TEST_STAFF_EMAIL).toMatch(
    /@([a-z0-9-]+\.)*example\.test$/i,
  );
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });
  const context = await browser.newContext(),
    page = await context.newPage();
  const run = randomUUID(),
    ids: string[] = [];
  const checkpoint = (stage: string) => writeFileSync(".playwright/t22-media-steps-safe.json", JSON.stringify({stage}));
  try {
    expect(
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ),
    ).toBe(1);
    const existing = new Set(
      (await pool.query("SELECT url FROM media")).rows.map((row) =>
        String(row.url),
      ),
    );
    const images = readdirSync("public", { recursive: true })
      .filter((name): name is string => typeof name === "string")
      .map((name) => "/" + name.replaceAll("\\", "/"))
      .filter(
        (url) =>
          /^\/[a-zA-Z0-9/_-]+\.(png|jpe?g|webp|avif)$/.test(url) &&
          !existing.has(url),
      )
      .sort()
      .slice(0, 79);
    expect(images).toHaveLength(79);
    const fixture = images.map((url, index) => ({
      id: randomUUID(),
      url,
      alt_en: `Synthetic media ${run} ${String(index).padStart(2, "0")}`,
      alt_zh: `合成活動圖片 ${run} ${String(index).padStart(2, "0")}`,
    }));
    ids.push(...fixture.map((row) => row.id));
    await pool.query(
      "INSERT INTO media(id,url,alt_en,alt_zh) SELECT id,url,alt_en,alt_zh FROM jsonb_to_recordset($1::jsonb) AS f(id uuid,url text,alt_en text,alt_zh text)",
      [JSON.stringify(fixture)],
    );
    const before = (await pool.query("SELECT count(*) AS n FROM events"))
      .rows[0].n;
    checkpoint("fixture-ready");
      await signInForM2(page, "staff");
    for (const [prefix, messages, width] of [
      ["", en, 1440],
      ["/zh", zh, 390],
    ] as const) {
      await page.setViewportSize({ width, height: 844 });
      checkpoint("media-route");
      await page.goto(prefix + "/admin/events-mgmt");
      const labels = messages.Admin.eventsMgmt;
      const search = page.getByRole("searchbox", {
        name: labels.mediaSearch,
        exact: true,
      });
      const select = page.getByRole("combobox", {
        name: labels.heroMediaId,
        exact: true,
      });
      checkpoint("search");
      await search.focus();
      await search.fill(`Synthetic media ${run}`);
      await expect(select.locator("option")).toHaveCount(80);
      await search.fill(fixture[78].alt_en);
      await expect(select.locator("option")).toHaveCount(2);
      await search.press("Tab");
      await expect(select).toBeFocused();
      // Observe native event order without storing media identifiers or page content.
      await select.evaluate(element => {
        const target = element as HTMLSelectElement & {auditEvents?: {type: string; index: number}[]};
        target.auditEvents=[];
        for(const type of ["input","change"])target.addEventListener(type,()=>target.auditEvents!.push({type,index:target.selectedIndex}),{capture:true});
      });
      // Exercise the actual native selection via keyboard, not a DOM value setter.
      checkpoint("keyboard-start");
      await select.press("Home");
      checkpoint("keyboard-down");
      await select.press("ArrowDown");
      checkpoint("keyboard-commit");
      await select.press("Tab");
      checkpoint("value");
      writeFileSync(".playwright/t22-media-native-events-safe.json",JSON.stringify(await select.evaluate(element => ({index:(element as HTMLSelectElement).selectedIndex,focused:document.activeElement===element,events:(element as HTMLSelectElement & {auditEvents?: {type: string;index: number}[]}).auditEvents}))));
      await expect(select).toHaveValue(fixture[78].id);
      const thumbnail = page.getByRole("img", {
        name: fixture[78].alt_en,
        exact: true,
      });
      await expect(thumbnail).toBeVisible();
      await expect
        .poll(() =>
          thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth),
        )
        .toBeGreaterThan(0);
      await select.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `.playwright/t17-media-${prefix ? "zh-HK-mobile" : "en-desktop"}.png`,
      });
      // Selection remains local; no event is created or published.
      await select.selectOption("");
      page.once("dialog", (dialog) => dialog.accept());
    }
    expect(
      (await pool.query("SELECT count(*) AS n FROM events")).rows[0].n,
    ).toBe(before);
    writeFileSync(
      "docs/audits/hkwtia-2026-10-01-remediation/evidence/t17/media-browser.json",
      JSON.stringify(
        {
          environment:
            "confirmed isolated Neon/Auth; built Next; synthetic registry fixtures; existing real static pixels",
          production: false,
          fixtureCount: 79,
          locales: ["en", "zh-HK"],
          keyboardFocus: true,
          selection: "native select Home, ArrowDown, Tab",
          realThumbnail: true,
          eventWrites: 0,
          providerUploads: 0,
        },
        null,
        2,
      ),
    );
  } finally {
    checkpoint("cleanup");
      await page.keyboard.press("Escape").catch(() => undefined);
    await context.close();
    if (ids.length)
      await pool.query(
        "DELETE FROM media WHERE id=ANY($1::uuid[]) AND alt_en LIKE $2",
        [ids, `Synthetic media ${run}%`],
      );
    await pool.end();
  }
});
});
