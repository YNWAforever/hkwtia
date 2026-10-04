import { randomUUID, randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Pool } from "pg";
import { expect, test, type Page } from "@playwright/test";
import {signInRemediationIdentity} from "../fixtures/full-remediation-browser";
import {assertIsolatedSeedEnvironment} from "../../scripts/lib/acceptance-guard";
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
    process.env.AUDIT_ISOLATED_ACCEPTANCE !== "1" ||
      process.env.CMS_SERVER_DRAFTS_ENABLED !== "true",
    "Requires explicitly enabled confirmed isolated CMS acceptance",
  );
  expect(baseURL).toBe("https://hkwtia-content-maintenance-20261003.vercel.app");
  expect(process.env.FULL_FIX_EXPECTED_SOURCE_SHA).toMatch(/^[a-f0-9]{40}$/);
  assertIsolatedSeedEnvironment(process.env,{prefix:"FULL_REMEDIATION",flag:"FULL_REMEDIATION_ACCEPTANCE_SEED",hostAllowlistVar:"FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
  const deployment=JSON.parse(readFileSync(".playwright/full-fix-t17-preview-deployment-safe.json","utf8")),runtime=JSON.parse(readFileSync(".playwright/full-fix-t17-preview-runtime-safe.json","utf8"));
  expect(deployment.sourceSha).toBe(process.env.FULL_FIX_EXPECTED_SOURCE_SHA);expect(deployment.target).toBeNull();expect(runtime.checks.some((c:{dbSourcePositivelyProven?:boolean})=>c.dbSourcePositivelyProven)).toBe(true);
  test.setTimeout(420000);
  expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
  expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe(
    "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
  );
  expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
  for (const prefix of ["M2_TEST_STAFF", "M2_TEST_SUPERADMIN"])
    expect(process.env[prefix + "_EMAIL"]).toMatch(
      /@([a-z0-9-]+\.)*example\.test$/i,
    );
  mkdirSync("docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17",{recursive:true});
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST,query_timeout:15000 });
  const run = "Synthetic CMS " + randomUUID(),
    hash = (value: string) =>
      createHash("sha256").update(value).digest("hex").slice(0, 16);
  writeFileSync(".playwright/full-fix-t17-cms-setup-safe.json",JSON.stringify({stage:"before-contexts"}));
  const contexts = await Promise.all([
    browser.newContext({baseURL,storageState:process.env.PLAYWRIGHT_STORAGE_STATE}),
    browser.newContext({baseURL,storageState:process.env.PLAYWRIGHT_STORAGE_STATE}),
    browser.newContext({baseURL,storageState:process.env.PLAYWRIGHT_STORAGE_STATE}),
    browser.newContext({baseURL,storageState:process.env.PLAYWRIGHT_STORAGE_STATE}),
  ]);
  writeFileSync(".playwright/full-fix-t17-cms-setup-safe.json",JSON.stringify({stage:"contexts-created"}));
  const [staff, other, anonymous, device] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );
  const copy = en.Admin.pageCopy,
    server = copy.serverDraft;
  const checkpoints: string[] = [];
  const checkpoint = (stage: string) => { checkpoints.push(stage); writeFileSync(".playwright/full-fix-t17-cms-steps-safe.json", JSON.stringify({stages: checkpoints})); };
  const facts: Record<string, unknown> = {
    scope:
      "confirmed isolated Neon/Auth; synthetic identities; actual built Next/browser/repository",
    production: false,
    sourceSha:process.env.FULL_FIX_EXPECTED_SOURCE_SHA,
    runRef:hash(run),
    actualPasswordAuth:true,
    syntheticPrivilegedRoleFixtures:true,
    googleMagicLinkVerified:false,
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
    ).toBe(59);
    checkpoint("staff-login");
    // Fresh reserved identities keep another run/operator's private drafts intact.
    // The surrounding G0/host/project/sentinel guards are checked before either
    // provider registration or this isolated fixture role binding. The app still
    // resolves every action's actor from Auth + the authoritative profile row.
    async function isolatedEditor(page: Page, role: "staff" | "superadmin") {
      const profileId = "cms-editor-" + randomUUID();
      const email = profileId + "@example.test";
      const password = randomBytes(32).toString("base64url");
      const response = await page.request.post("/api/auth/sign-up/email", {
        headers: {Origin: baseURL!},
        data: {email, password, name: "Synthetic CMS editor"},
      });
      expect(response.ok()).toBe(true);
      const session = await page.request.get("/api/auth/get-session");
      expect(session.ok()).toBe(true);
      const identity = (await session.json()).user;
      expect(typeof identity?.id).toBe("string");
      expect(identity.email).toBe(email);
      expect((await pool.query("SELECT id FROM profiles WHERE auth_user_id=$1", [identity.id])).rows).toHaveLength(0);
      await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,consent_marketing,directory_visible) VALUES($1,$2,$3,'Synthetic CMS editor',$4,'en',false,false)", [profileId,identity.id,email,role]);
      return {profileId, email, password, authUserId: identity.id as string};
    }
    const staffEditor = await isolatedEditor(staff, "staff");
    await isolatedEditor(other, "superadmin");
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
    const deviceLogin = await device.request.post("/api/auth/sign-in/email", {
      headers: {Origin: baseURL!},
      data: {email: staffEditor.email, password: staffEditor.password},
    });
    expect(deviceLogin.ok()).toBe(true);
    const deviceSession = await device.request.get("/api/auth/get-session");
    expect(deviceSession.ok()).toBe(true);
    expect((await deviceSession.json()).user?.id).toBe(staffEditor.authUserId);
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
        path: `docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17/${locale}-private-preview.png`,
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
      path: "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17/en-cms-mobile.png",
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
    mkdirSync("docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17", {
      recursive: true,
    });
    writeFileSync(
      "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17/browser.json",
      JSON.stringify(facts, null, 2),
    );
  } finally {
    checkpoint("cleanup");
    await Promise.all(contexts.map((context) => context.close()));
    await pool.end();
  }
});


async function showHero(page:Page,locale:'en'|'zh-HK'){
 const copy=JSON.parse(readFileSync('messages/'+locale+'.json','utf8'));
 await page.getByRole('combobox',{name:copy.Admin.pageCopy.workspace.block,exact:true}).selectOption('hero');
}
const evidence='docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17/';
test.describe('isolated CMS history and tab storage',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Requires confirmed isolated DB/Auth and synthetic identities');
 test.beforeAll(async({baseURL})=>{expect(baseURL).toBe('https://hkwtia-content-maintenance-20261003.vercel.app');expect(process.env.CMS_SERVER_DRAFTS_ENABLED).toBe('true');expect(process.env.FULL_FIX_EXPECTED_SOURCE_SHA).toMatch(/^[a-f0-9]{40}$/);const deployment=JSON.parse(readFileSync('.playwright/full-fix-t17-preview-deployment-safe.json','utf8'));expect(deployment.sourceSha).toBe(process.env.FULL_FIX_EXPECTED_SOURCE_SHA);expect(deployment.target).toBeNull();mkdirSync(evidence,{recursive:true});});
 test.beforeEach(async({context,baseURL,page})=>{await signInRemediationIdentity(context,baseURL!);page.on('dialog',dialog=>dialog.accept());});
 for(const [locale,width,restore]of [['zh-HK',1440,'恢復草稿'],['en',390,'Restore draft']]as const){
 test(locale+' recovers bilingual edits after real browser history',async({page,context,baseURL})=>{
 await page.setViewportSize({width,height:960});await context.addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);
 const path=(locale==='zh-HK'?'/zh':'')+'/admin/page-copy';
 await page.goto(path);await page.locator('a[href="'+path+'/Home"]').click();await page.waitForURL('**/page-copy/Home');await showHero(page,locale);
 await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic T04 unsaved English');await page.locator('textarea[name="copy:zh-HK:hero.title"]').fill('合成 T04 未發布草稿');
 await expect(page.getByText(locale==='zh-HK'?/在此分頁暫存/:/Saved in this tab/)).toBeVisible();
 await page.goBack();await page.waitForURL('**/page-copy');await page.goForward();await page.waitForURL('**/page-copy/Home');await showHero(page,locale);
 // Next may retain this Client Component in memory; both retained and restored paths must keep the edits.
 if(await page.getByRole('button',{name:restore,exact:true}).count())await page.getByRole('button',{name:restore,exact:true}).click();await showHero(page,locale);
 await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic T04 unsaved English');await expect(page.locator('textarea[name="copy:zh-HK:hero.title"]')).toHaveValue('合成 T04 未發布草稿');
 // A full reload removes the in-memory path and proves the explicit session-storage recovery.
 await page.reload();await expect(page.getByRole('button',{name:restore,exact:true})).toBeVisible();await page.getByRole('button',{name:restore,exact:true}).click();await showHero(page,locale);
 await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic T04 unsaved English');await expect(page.locator('textarea[name="copy:zh-HK:hero.title"]')).toHaveValue('合成 T04 未發布草稿');
 await page.locator('textarea[name="copy:en:hero.title"]').scrollIntoViewIfNeeded();await page.waitForLoadState('networkidle');await page.screenshot({path:evidence+locale+'-recovered-'+width+'.png'});
 writeFileSync(evidence+locale+'-history.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceSha:process.env.FULL_FIX_EXPECTED_SOURCE_SHA,environment:'confirmed isolated actual Preview DB/Auth',locale,width,field:'hero.title',nativeBackForward:true,explicitRestoreAfterReload:true,bilingualRecovered:true,published:false},null,2));
 });
 }
 test('denied storage warns truthfully and keeps edits in the form',async({page})=>{
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('hkwtia:cms-draft:'))throw new DOMException('Test denied storage','SecurityError');return original.call(this,key,value);};});
 await page.goto('/zh/admin/page-copy/Home');await showHero(page,'zh-HK');await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic denied-storage draft');
 await expect(page.getByRole('alert').filter({hasText:'無法暫存草稿'})).toContainText('無法暫存草稿');await expect(page.getByText(/在此分頁暫存/)).toHaveCount(0);await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic denied-storage draft');
 await page.waitForLoadState('networkidle');await page.screenshot({path:evidence+'zh-storage-unavailable.png'});
 writeFileSync(evidence+'storage-denied.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceSha:process.env.FULL_FIX_EXPECTED_SOURCE_SHA,environment:'confirmed isolated actual Preview browser',storageDenied:true,warningVisible:true,falseSavedClaim:false,editsRemain:true,published:false},null,2));
 });
 test('offline edit retains a truthful local draft and recovers after reconnect',async({page,context})=>{
 await page.goto('/zh/admin/page-copy/Home');await showHero(page,'zh-HK');
 await context.setOffline(true);await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic T17 offline unsaved');
 await expect(page.getByText(/在此分頁暫存/)).toBeVisible();await expect(page.getByText(zh.Admin.pageCopy.serverDraft.saved,{exact:true})).toHaveCount(0);
 await context.setOffline(false);await page.reload();await page.getByRole('button',{name:zh.Admin.pageCopy.localDraft.restore,exact:true}).click();await showHero(page,'zh-HK');
 await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic T17 offline unsaved');
 writeFileSync(evidence+'offline-local-recovery.json',JSON.stringify({sourceSha:process.env.FULL_FIX_EXPECTED_SOURCE_SHA,offlineLocalDraft:true,reconnectedReloadRestored:true,serverSaveClaimed:false,serverSaveAttempted:false,published:false,production:false},null,2));
 });
 test('another authorized synthetic identity cannot see the prior identity draft',async({page,context,baseURL})=>{
 await page.goto('/zh/admin/page-copy/Home');await showHero(page,'zh-HK');await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic identity A private draft');
 const logout=await context.request.post('/api/auth/sign-out',{data:{},headers:{Origin:baseURL!}});expect(logout.status()).toBe(200);
 await signInRemediationIdentity(context,baseURL!,'STAFF');await page.goto('/zh/admin/page-copy/Home');await showHero(page,'zh-HK');
 await expect(page.getByRole('button',{name:'恢復草稿',exact:true})).toHaveCount(0);await expect(page.locator('textarea[name="copy:en:hero.title"]')).not.toHaveValue('Synthetic identity A private draft');
 writeFileSync(evidence+'identity-isolation.json',JSON.stringify({checkedAt:new Date().toISOString(),sourceSha:process.env.FULL_FIX_EXPECTED_SOURCE_SHA,environment:'confirmed isolated actual Preview Auth',syntheticLogoutAndStaffLogin:true,priorDraftDisclosed:false,published:false},null,2));
 });
});

const publicEvidence='docs/audits/hkwtia-2026-10-03-full-fix/evidence/t17/';
// Paths discovered from current graph Page symbols, not guessed URLs.
const publicRoutes=['/','/about','/membership','/join','/events','/news','/programmes','/programs/asa','/programs/cpai','/programs/hkict','/programs/tct','/contact','/privacy','/partners'] as const;
test.describe('bilingual public maintenance scope',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Confirmed isolated actual Preview required');
 let pool:Pool;
 const published=randomUUID(),privatePost=randomUUID(),archived=randomUUID(),run=randomUUID();
 const publicSlug='synthetic-t17-public-'+run,privateSlug='synthetic-t17-private-'+run,archivedSlug='synthetic-t17-archived-'+run;
 test.beforeAll(async({baseURL})=>{
  expect(baseURL).toBe('https://hkwtia-content-maintenance-20261003.vercel.app');
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  const d=JSON.parse(readFileSync('.playwright/full-fix-t17-preview-deployment-safe.json','utf8')),r=JSON.parse(readFileSync('.playwright/full-fix-t17-preview-runtime-safe.json','utf8'));
  expect(d.sourceSha).toBe(process.env.FULL_FIX_EXPECTED_SOURCE_SHA);expect(d.target).toBeNull();expect(r.checks.some((c:{dbSourcePositivelyProven?:boolean})=>c.dbSourcePositivelyProven)).toBe(true);
  pool=new Pool({connectionString:url,query_timeout:15000});expect(Number((await pool.query('SELECT count(*) AS n FROM acceptance_sentinel')).rows[0].n)).toBe(1);
  await pool.query("INSERT INTO posts(id,slug,kind,title_en,title_zh,body_mdx,body_mdx_zh_hk,published_at,archived_at,author) VALUES($1,$2,'news','Synthetic T17 published','合成T17已發布','Synthetic read-only content','合成只讀內容',now(),null,'Synthetic test'),($3,$4,'news','Synthetic T17 private','合成T17私人','Synthetic private','合成私人',null,null,'Synthetic test'),($5,$6,'news','Synthetic T17 archived','合成T17封存','Synthetic archived','合成封存',now(),now(),'Synthetic test')",[published,publicSlug,privatePost,privateSlug,archived,archivedSlug]);
 });
 test.afterAll(async()=>{if(pool){await pool.query('DELETE FROM posts WHERE id=ANY($1::uuid[])',[[published,privatePost,archived]]);await pool.end();}});
 for(const locale of ['en','zh-HK'] as const)test(locale+' actual discovered public routes, publication boundary and keyboard login',async({page})=>{
  test.setTimeout(360000);const prefix=locale==='zh-HK'?'/zh':'',checks:object[]=[];
  for(const route of publicRoutes){const path=prefix+(route==='/'?'/':route);const response=await page.goto(path,{waitUntil:'domcontentloaded'});expect(response?.status()).toBe(200);await expect(page.getByRole('main')).toHaveCount(1);if(route!=='/join')await expect(page.locator('main#main-content')).toHaveCount(1);await expect(page.locator('main h1').first()).toBeVisible();expect((await page.title()).trim().length).toBeGreaterThan(0);expect(await page.locator('main').innerText()).not.toMatch(/TODO|Lorem ipsum|price_[a-z0-9]+/i);checks.push({path,status:200,titlePresent:true,mainHeadingPresent:true});}
  await page.goto(prefix+'/news/'+publicSlug);await expect(page.getByRole('heading',{level:1,exact:true,name:locale==='en'?'Synthetic T17 published':'合成T17已發布'})).toBeVisible();
  for(const slug of [privateSlug,archivedSlug]){const response=await page.goto(prefix+'/news/'+slug);expect(response?.status()).toBe(404);expect(await page.content()).not.toContain('Synthetic T17 '+(slug===privateSlug?'private':'archived'));}
  const sitemap=await page.request.get('/sitemap.xml');expect(sitemap.status()).toBe(200);const xml=await sitemap.text();expect(xml).not.toContain(privateSlug);expect(xml).not.toContain(archivedSlug);expect(xml).not.toContain('/admin/cms-preview/');
  await page.goto(prefix||'/');const member=page.getByRole('banner').locator('a[href="'+prefix+'/member-login"]');await member.focus();await member.press('Enter');await expect(page).toHaveURL(new RegExp(prefix+'/member-login$'));
  await page.setViewportSize({width:390,height:844});await page.goto(prefix+'/partners');expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
  const links=await page.locator('.partner-record-card a').evaluateAll(nodes=>nodes.map(n=>(n as HTMLAnchorElement).href));expect(links.every(href=>{const u=new URL(href);return u.protocol==='https:'&&!u.username&&!u.password;})).toBe(true);
  await page.screenshot({path:publicEvidence+locale+'-public-partners-mobile.png'});
  writeFileSync(publicEvidence+locale+'-public-scope.json',JSON.stringify({observedAt:new Date().toISOString(),sourceSha:process.env.FULL_FIX_EXPECTED_SOURCE_SHA,checks,privateAndArchived404:true,privateExcludedFromSitemap:true,keyboardLogin:true,partnerLinksStructurallyValidated:links.length,unapprovedPartnerUrlsInvented:false,historicalClaimsOwnerApproval:false,production:false},null,2));
 });
});
