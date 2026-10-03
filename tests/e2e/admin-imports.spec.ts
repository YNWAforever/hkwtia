import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {expect, test, type Page} from "@playwright/test";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";
const en = JSON.parse(readFileSync(new URL("../../messages/en.json", import.meta.url), "utf8")) as typeof import("../../messages/en.json");
const zh = JSON.parse(readFileSync(new URL("../../messages/zh-HK.json", import.meta.url), "utf8")) as typeof import("../../messages/zh-HK.json");
const execute = promisify(execFile);
async function driver(mode: string, run: string, batchId?: string) {
  const {stdout} = await execute(process.execPath, ["--conditions=react-server", "--import", "tsx", "tests/fixtures/audit-import-driver.ts", mode, run, ...(batchId ? [batchId] : [])], {timeout: 120000});
  return JSON.parse(stdout) as {csv: string; prepared: boolean; claimed: number; profile: {locale: string}; contact: {source: string; profile_id: string | null}[]; memberships: number; audits: {row_number: number; n: number}[]};
}
async function count(page: Page, label: string, value: number) {
  await expect(page.locator("dl > div").filter({has: page.locator("dt", {hasText: new RegExp(`^${label}$`)})}).locator("dd")).toHaveText(String(value));
}
for (const [locale, prefix, messages] of [["en", "", en], ["zh-HK", "/zh", zh]] as const) {
  test(`${locale}: import reviews differences and commits only two eligible synthetic rows`, async ({page, baseURL}) => {
    test.skip(missingM2IdentityEnvironment().length > 0 || process.env.AUDIT_ISOLATED_ACCEPTANCE !== "true" || process.env.AUDIT_BATCH_WORKER_PAUSED !== "true" || process.env.MEMBER_IMPORT_ENABLED !== "true", "Requires isolated identities, import flags and a paused batch worker");
    expect(new URL(baseURL!).hostname).not.toBe("hkwtia.vercel.app");
    const run = randomUUID(), fixture = await driver("seed", run), labels = messages.Admin.imports, batch = messages.Admin.batches;
    await signInForM2(page, "staff"); await page.goto(`${prefix}/admin/members/import`);
    await page.getByLabel(labels.chooseFile).setInputFiles({name: `synthetic-${run}.csv`, mimeType: "text/csv", buffer: Buffer.from(fixture.csv)});
    await page.getByRole("button", {name: labels.upload, exact: true}).click();
    for (const [field, header] of [["profileId", "Member ID"], ["email", "Email"], ["locale", "Locale"], ["displayName", "Name"], ["planCode", "Plan"]] as const) await page.getByRole("combobox", {name: labels.fields[field], exact: true}).selectOption(header);
    await page.getByRole("button", {name: labels.validate, exact: true}).click();
    for (const [label, value] of [[labels.total, 4], [labels.create, 1], [labels.update, 1], [labels.invalid, 1], [labels.duplicate, 1]] as const) await count(page, label, value);
    await page.getByRole("button", {name: labels.preview, exact: true}).click();
    await expect(page.getByRole("columnheader", {name: labels.before, exact: true})).toBeVisible();
    await expect(page.getByRole("columnheader", {name: labels.incoming, exact: true})).toBeVisible();
    await expect(page.getByRole("checkbox", {name: `${labels.row} 4`, exact: true})).toBeDisabled();
    await expect(page.getByRole("checkbox", {name: `${labels.row} 5`, exact: true})).toBeDisabled();
    await page.getByRole("button", {name: labels.selectAll, exact: true}).click();
    await expect(page.getByRole("status")).toHaveText(labels.selected.replace("{count}", "2"));
    await page.getByRole("button", {name: labels.confirm, exact: true}).click();
    await page.getByRole("button", {name: labels.prepare, exact: true}).click();
    await expect(page).toHaveURL(/\/admin\/batches\/[a-f0-9-]+$/);
    const batchId = new URL(page.url()).pathname.split("/").at(-1)!;
    expect((await driver("prepare", run, batchId)).prepared).toBe(true); await page.reload();
    await count(page, batch.total, 2); await count(page, batch.eligible, 2);
    await page.getByRole("button", {name: batch.commit, exact: true}).click();
    // Native confirmation must block submission before the acknowledged commit.
    await expect(page.getByRole("status")).toHaveText(batch.states.ready);
    await page.getByRole("checkbox", {name: batch.confirm, exact: true}).check();
    await page.getByRole("button", {name: batch.commit, exact: true}).click();
    await expect(page.getByRole("status")).toHaveText(batch.states.queued);
    expect((await driver("execute", run, batchId)).claimed).toBe(2); await page.reload();
    await expect(page.getByRole("status")).toHaveText(batch.states.completed);
    await count(page, batch.counters.succeeded, 2);
    const facts = await driver("facts", run, batchId);
    expect(facts.profile.locale).toBe("zh-HK"); expect(facts.contact).toEqual([{source: "import", profile_id: null}]);
    expect(facts.memberships).toBe(0); expect(facts.audits).toEqual([{row_number: 2, n: 1}, {row_number: 3, n: 1}]);
  });
}
