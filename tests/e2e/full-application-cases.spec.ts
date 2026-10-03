import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { expect, test } from '@playwright/test';
import { signInRemediationIdentity } from '../fixtures/full-remediation-browser';
import { assertIsolatedSeedEnvironment, assertSeedSentinel } from '../../scripts/lib/acceptance-guard';
const profile = randomUUID(), application = randomUUID(), membership = randomUUID();
let pool: Pool;
const evidence = 'docs/audits/hkwtia-2026-10-01-remediation/evidence/t10/';
test.use({ trace: 'off', video: 'off', actionTimeout: 30000 });
test.describe('actual isolated application follow-up and CAS', () => {
    test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE !== '1', 'Confirmed isolated DB/Auth required');
    test.beforeAll(async ({ baseURL }) => {
        const url = assertIsolatedSeedEnvironment(process.env, { prefix: 'FULL_REMEDIATION', flag: 'FULL_REMEDIATION_ACCEPTANCE_SEED', hostAllowlistVar: 'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST' });
        expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');
        expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
        expect(new URL(baseURL!).hostname).toBe('localhost');
        pool = new Pool({ connectionString: url });
        await assertSeedSentinel('FULL_REMEDIATION', async () => Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
        await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic application case','member')", [profile, 'fr-case-' + profile + '@example.test']);
        await pool.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,current_step,status) VALUES($1,$2,'patron','review','pending_review')", [application, profile]);
        await pool.query("INSERT INTO memberships(id,owner_user_id,application_id,plan_code,status,seat_limit) VALUES($1,$2,$3,'patron','pending_review',1)", [membership, profile, application]);
        fs.mkdirSync(evidence, { recursive: true });
    });
    test.beforeEach(async () => { await pool.query('DELETE FROM staff_tasks WHERE dedupe_key=$1', ['membership-application:' + application]); await pool.query("DELETE FROM audit_events WHERE target_type='membership_application' AND target_id=$1", [application]); });
    test.afterAll(async () => { if (pool) {
        await pool.query('DELETE FROM staff_tasks WHERE dedupe_key=$1', ['membership-application:' + application]);
        await pool.query("DELETE FROM audit_events WHERE target_type='membership_application' AND target_id=$1", [application]);
        await pool.query('DELETE FROM memberships WHERE id=$1', [membership]);
        await pool.query('DELETE FROM membership_applications WHERE id=$1', [application]);
        await pool.query('DELETE FROM profiles WHERE id=$1', [profile]);
        await pool.end();
    } });
    for (const locale of ['zh-HK', 'en'] as const)
        test(locale + ' staff assigns, follows up and rejects a stale tab without changing rights', async ({ page, context, browser, baseURL }) => {
            const prefix = locale === 'en' ? '' : '/zh';
            await signInRemediationIdentity(context, baseURL!, 'STAFF');
            await context.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL! }]);
            await page.setViewportSize({ width: locale === 'en' ? 390 : 1440, height: 960 });
            const response = await page.goto(prefix + '/admin/members/queue/' + application);
            expect(response?.status()).toBe(200);
            const copy = JSON.parse(fs.readFileSync('messages/' + locale + '.json', 'utf8')).Admin.applicationCase;
            await expect(page.getByRole('heading', { level: 1, name: copy.title })).toBeVisible();
            expect((await pool.query('SELECT count(*)::int AS count FROM staff_tasks WHERE dedupe_key=$1', ['membership-application:' + application])).rows).toEqual([{ count: 0 }]);
            const second = await browser.newContext({ baseURL });
            try {
                await signInRemediationIdentity(second, baseURL!, 'STAFF');
                await second.addCookies([{ name: 'NEXT_LOCALE', value: locale, url: baseURL! }]);
                const stale = await second.newPage();
                await stale.goto(prefix + '/admin/members/queue/' + application);
                await expect(stale.getByLabel(copy.note)).toBeVisible();
                await page.getByLabel(copy.owner, { exact: true }).selectOption('m2-exco-01');
                await page.getByLabel(copy.due, { exact: true }).fill('2026-10-02T14:30');
                await page.getByLabel(copy.missingFields.companyWebsite, { exact: true }).check();
                await page.getByLabel(copy.nextAction, { exact: true }).selectOption('await_documents');
                await page.getByLabel(copy.note, { exact: true }).fill('Synthetic follow-up; website document pending');
                await page.getByRole('button', { name: copy.save, exact: true }).focus();
                await page.keyboard.press('Enter');
                await expect(page.getByRole('status').filter({ hasText: copy.saved })).toBeVisible();
                const tasks = (await pool.query('SELECT context FROM staff_tasks WHERE dedupe_key=$1', ['membership-application:' + application])).rows;
                expect(tasks).toHaveLength(1);
                expect(tasks[0].context).toMatchObject({ applicationId: application, ownerProfileId: 'm2-exco-01', dueAt: '2026-10-02T06:30:00.000Z', missingFields: ['companyWebsite'], nextActionCode: 'await_documents' });
                await expect(page.getByText('Synthetic follow-up; website document pending', { exact: true })).toBeVisible();
                await page.goto(prefix+'/admin/tasks');
                await expect(page.locator('a[href="'+prefix+'/admin/members/queue/'+application+'"]')).toBeVisible();
                await page.goto(prefix+'/admin/members/queue/'+application);
                await stale.getByLabel(copy.note, { exact: true }).fill('Stale synthetic update must not replace case');
                await stale.getByRole('button', { name: copy.save, exact: true }).click();
                await expect(stale.getByRole('alert').filter({ hasText: copy.conflict })).toBeVisible();
                expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='membership.application.case.updated'", [application])).rows).toEqual([{ count: 1 }]);
                expect((await pool.query('SELECT status,owner_user_id FROM memberships WHERE id=$1', [membership])).rows).toEqual([{ status: 'pending_review', owner_user_id: profile }]);
                expect((await pool.query('SELECT status FROM membership_applications WHERE id=$1', [application])).rows).toEqual([{ status: 'pending_review' }]);
                await page.screenshot({ path: evidence + locale + '-case.png' });
                fs.writeFileSync(evidence + locale + '-case.json', JSON.stringify({ environment: 'confirmed isolated DB/Auth; actual Chromium', locale, viewport: locale === 'en' ? 390 : 1440, http: 200, getWrites: 0, caseRows: 1, caseAudits: 1, owner: 'synthetic ExCo', dueHKT: '2026-10-02 14:30', missing: ['companyWebsite'], nextAction: 'await_documents', stale: 'conflict without overwrite', membership: 'pending_review unchanged', application: 'pending_review unchanged', keyboard: true, providerSend: false, production: false }, null, 2));
            }
            finally {
                await second.close();
            }
        });
});
