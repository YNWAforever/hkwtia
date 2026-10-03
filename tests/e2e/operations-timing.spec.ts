import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {Pool} from "pg";
import AxeBuilder from "@axe-core/playwright";
import {expect, test} from "@playwright/test";
import {assertIsolatedSeedEnvironment, assertSeedSentinel} from "@/scripts/lib/acceptance-guard";
import {signInForM2} from "../fixtures/m2-auth";
let pool: Pool;
const source = randomUUID(), caseId = randomUUID(), comparisonId = randomUUID();
const frozenSource = randomUUID(), frozenCase = randomUUID(), frozenComparison = randomUUID();
test.use({trace: "off"});
test.setTimeout(90_000);
test.beforeAll(async () => {
  test.skip(process.env.OPERATIONS_TIMING_ACCEPTANCE !== "true", "Requires positively verified isolated DB/Auth and synthetic staff credentials.");
  const url = assertIsolatedSeedEnvironment(process.env, {prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
  expect(new URL(url).hostname).toBe("ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");
  expect(new URL(process.env.NEON_AUTH_BASE_URL!).hostname).toBe("ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech");
  pool = new Pool({connectionString: url});
  await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS count FROM acceptance_sentinel")).rows[0].count));
  await pool.query("INSERT INTO audit_events(id,actor_user_id,actor_type,action,target_type,target_id) VALUES($1,'m2-staff-01','staff','synthetic_timing_source','conversation',$2)", [source, caseId]);
  await pool.query("INSERT INTO audit_events(id,actor_user_id,actor_type,action,target_type,target_id) VALUES($1,'m2-staff-01','staff','synthetic_baseline_source','conversation',$2)", [frozenSource, frozenCase]);
  for (const [date, minutes] of [["2026-09-02T00:00:00.000Z", 10], ["2026-09-04T00:00:00.000Z", 6]] as const) {
    const observation = {observationId: randomUUID(), caseId: frozenCase, caseKind: "support", auditId: frozenSource, runId: null,
      comparisonId: frozenComparison, startedAt: date, endedAt: new Date(Date.parse(date) + minutes * 60000).toISOString(),
      humanMinutes: minutes, reviewMinutes: 0, reworkMinutes: 0, waitMinutes: 0, decision: "manual", cohort: "baseline", reopened: minutes === 6};
    await pool.query("INSERT INTO audit_events(actor_user_id,actor_type,action,target_type,target_id,metadata) VALUES('m2-staff-01','staff','admin_operation_observed','admin_operation',$1,$2::jsonb)", [observation.observationId, JSON.stringify({version: 1, observation})]);
  }
});
test.afterAll(async () => {if (pool) {
  // Delete only receipts whose strict source reference is this run's owned synthetic audit UUID.
  await pool.query("DELETE FROM audit_events WHERE id=ANY($1::uuid[]) OR (target_type='admin_operation' AND metadata->'observation'->>'auditId'=ANY($2::text[])) OR (target_type='admin_operation_baseline' AND target_id=$3)", [[source, frozenSource], [source, frozenSource], frozenComparison]);
  await pool.end();
}});
for (const [index, locale, prefix, width] of [[0, "en", "", 1440], [1, "zh-HK", "/zh", 1440], [2, "en", "", 390], [3, "zh-HK", "/zh", 390]] as const) {
  test(`${locale} ${width}px staff records exclusive work while savings remain unmeasured`, async ({page, baseURL}) => {
    const messages = JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"));
    const labels = messages.OperationsTiming;
    expect(new URL(baseURL!).hostname).toBe("localhost");
    await signInForM2(page, "staff");
    await page.setViewportSize({width, height: 900});
    await page.goto(prefix + "/admin/reports");
    await expect(page.getByRole("heading", {name: labels.heading, exact: true})).toBeVisible();
    await expect(page.getByText(labels.status, {exact: true})).toBeVisible();
    await page.locator("summary").filter({hasText: labels.formLabel}).click();
    const form = page.getByRole("form", {name: labels.formLabel});
    await form.getByLabel(labels.caseId, {exact: true}).fill(caseId);
    await form.getByLabel(labels.caseKind, {exact: true}).selectOption("support");
    await form.getByLabel(labels.auditId, {exact: true}).fill(source);
    await form.getByLabel(labels.comparisonId, {exact: true}).fill(comparisonId);
    const end = new Date(Date.now() - (index * 20 + 5) * 60_000);
    end.setSeconds(0, 0);
    const start = new Date(end.getTime() - 10 * 60_000);
    const local = (value: Date) => new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await form.getByLabel(labels.startedAt, {exact: true}).fill(local(start));
    await form.getByLabel(labels.endedAt, {exact: true}).fill(local(end));
    for (const [name, minutes] of [["humanMinutes", 4], ["reviewMinutes", 2], ["reworkMinutes", 1], ["waitMinutes", 3]] as const) await form.getByLabel(labels[name], {exact: true}).fill(String(minutes));
    await form.getByRole("button", {name: labels.submit, exact: true}).click();
    await expect(form.getByRole("status")).toHaveText(labels.saved);
    await expect(form.getByRole("button", {name: labels.submit, exact: true})).toBeEnabled();
    const before = (await pool.query("SELECT id,target_id,metadata FROM audit_events WHERE target_type='admin_operation' AND metadata->'observation'->>'auditId'=$1", [source])).rows;
    expect(before).toHaveLength(index + 1);
    expect(JSON.stringify(before)).not.toMatch(/body|email|cookie|token/);
    await form.getByRole("button", {name: labels.submit, exact: true}).click();
    await expect(form.getByRole("status")).toHaveText(labels.saved);
    await expect(form.getByRole("button", {name: labels.submit, exact: true})).toBeEnabled();
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_type='admin_operation' AND metadata->'observation'->>'auditId'=$1", [source])).rows[0].count).toBe(index + 1);
    await expect(page.getByText(labels.status, {exact: true})).toBeVisible();
    const axe = await new AxeBuilder({page}).include("form").analyze();
    expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await test.info().attach(`${locale}-${width}-staff-timing`, {body: await page.screenshot(), contentType: "image/png"});
    await page.goto(prefix + "/ai-ops");
    await expect(page.getByRole("heading", {name: messages.AiOps.operationsHeading, exact: true})).toBeVisible();
    await expect(page.getByText(messages.AiOps.operationsUnmeasured, {exact: true})).toBeVisible();
  });
}

test("zh-HK staff freezes a server-derived manual comparison without enabling AI", async ({page}) => {
 const labels = JSON.parse(readFileSync(new URL("../../messages/zh-HK.json", import.meta.url), "utf8")).OperationsTiming;
 await signInForM2(page, "staff");
 await page.setViewportSize({width: 390, height: 900});
 await page.goto("/zh/admin/reports");
 await page.locator("summary").filter({hasText: labels.freezeHeading}).click();
 const form = page.getByRole("form", {name: labels.freezeHeading});
 await form.getByLabel(labels.comparisonId, {exact: true}).fill(frozenComparison);
 const local = (date: string) => {const value = new Date(date);return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16);};
 await form.getByLabel(labels.baselineFrom, {exact: true}).fill(local("2026-09-01T00:00:00.000Z"));
 await form.getByLabel(labels.baselineTo, {exact: true}).fill(local("2026-09-15T00:00:00.000Z"));
 await form.getByRole("button", {name: labels.freezeSubmit, exact: true}).click();
 await expect(form.getByRole("status")).toHaveText(labels.freezeSaved);
 await expect(form.getByRole("button", {name: labels.freezeSubmit, exact: true})).toBeEnabled();
 const snapshots = (await pool.query("SELECT metadata FROM audit_events WHERE target_type='admin_operation_baseline' AND target_id=$1", [frozenComparison])).rows;
 expect(snapshots).toHaveLength(1);
 expect(snapshots[0].metadata.baseline.means).toEqual([{caseKind: "support", sampleCount: 1, minutesPerCase: 16}]);
 expect(snapshots[0].metadata.receiptDigest).toMatch(/^[a-f0-9]{64}$/);
 const axe = await new AxeBuilder({page}).include("form").analyze();
 expect(axe.violations.filter(v => v.impact === "serious" || v.impact === "critical")).toEqual([]);
 await test.info().attach("zh-HK-390-frozen-baseline", {body: await page.screenshot(), contentType: "image/png"});
});
