import fs from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { expect, test } from '@playwright/test';
import { STRIPE_API_VERSION } from '../../lib/billing/stripe-api-version';
import { signInRemediationIdentity } from '../fixtures/full-remediation-browser';
import { assertIsolatedSeedEnvironment, assertSeedSentinel } from '../../scripts/lib/acceptance-guard';
const application = randomUUID(), membership = randomUUID(), company = randomUUID();
let pool: Pool, stripe: Stripe;
const evidence = 'docs/audits/hkwtia-2026-10-01-remediation/evidence/t09/';
const policyVersion = process.env.MEMBERSHIP_POLICY_ACTIVE_VERSION!;
test.use({ trace: 'off', video: 'off' });
test.describe('synthetic approved-policy mechanism in actual isolated checkout', () => {
    test.skip(process.env.RUN_STRIPE_TEST_ACCEPTANCE !== '1' || process.env.MEMBERSHIP_POLICY_ACCEPTANCE_ENABLED !== 'true', 'Explicit isolated synthetic-policy and Stripe TEST opt-in required');
    test.beforeAll(async ({ request, baseURL }) => {
        const url = assertIsolatedSeedEnvironment(process.env, { prefix: 'FULL_REMEDIATION', flag: 'FULL_REMEDIATION_ACCEPTANCE_SEED', hostAllowlistVar: 'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST' });
        expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');
        expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
        expect(new URL(baseURL!).hostname).toBe('localhost');
        expect(policyVersion).toMatch(/^synthetic-browser-/);
        expect(process.env.STRIPE_TEST_SECRET_KEY).toMatch(/^sk_test_/);
        expect(process.env.STRIPE_SECRET_KEY === process.env.STRIPE_TEST_SECRET_KEY).toBe(true);
        expect(process.env.AUDIT_BATCH_WORKER_PAUSED).toBe('true');
        const response = await request.post('/api/auth/sign-in/email', { headers: { Origin: baseURL! }, data: { email: process.env.M2_TEST_MEMBER_EMAIL, password: process.env.M2_TEST_MEMBER_PASSWORD, callbackURL: '/join' } });
        expect(response.status()).toBe(200);
        const authId = (await response.json()).user.id;
        pool = new Pool({ connectionString: url });
        await assertSeedSentinel('FULL_REMEDIATION', async () => Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
        const owners = (await pool.query("SELECT id FROM profiles WHERE auth_user_id=$1 AND role='member'", [authId])).rows;
        expect(owners).toHaveLength(1);
        stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY!, { apiVersion: STRIPE_API_VERSION });
        await pool.query("INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic policy browser company','Synthetic policy browser company')", [company]);
        await pool.query("INSERT INTO company_members(company_id,user_id,role) VALUES($1,$2,'owner')", [company, owners[0].id]);
        await pool.query("INSERT INTO membership_applications(id,applicant_user_id,company_id,plan_code,current_step,status) VALUES($1,$2,$3,'corporate','checkout','pending_payment')", [application, owners[0].id, company]);
        await pool.query("INSERT INTO memberships(id,company_id,application_id,plan_code,status,seat_limit) VALUES($1,$2,$3,'corporate','pending_payment',10)", [membership, company, application]);
        fs.mkdirSync(evidence, { recursive: true });
    });
    test.afterAll(async () => {
        if (pool) {
            const attempts = (await pool.query('SELECT stripe_checkout_session_id FROM billing_attempts WHERE membership_id=$1', [membership])).rows;
            for (const row of attempts)
                if (row.stripe_checkout_session_id) {
                    const session = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id);
                    expect(session.livemode).toBe(false);
                    if (session.status === 'open')
                        await stripe.checkout.sessions.expire(session.id);
                }
            await pool.query('DELETE FROM audit_events WHERE (target_type=\'membership_application\' AND target_id=$1) OR (target_type=\'membership_policy\' AND target_id=$2)', [application, policyVersion]);
            await pool.query('DELETE FROM billing_attempts WHERE membership_id=$1', [membership]);
            await pool.query('DELETE FROM memberships WHERE id=$1', [membership]);
            await pool.query('DELETE FROM membership_applications WHERE id=$1', [application]);
            await pool.query('DELETE FROM company_members WHERE company_id=$1', [company]);
            await pool.query('DELETE FROM companies WHERE id=$1', [company]);
            await pool.end();
        }
    });
    test('unchecked server submission writes no payment; keyboard confirmation records one receipt and reaches real TEST checkout', async ({ page, context, baseURL }) => {
        await signInRemediationIdentity(context, baseURL!, 'MEMBER');
        await context.addCookies([{ name: 'NEXT_LOCALE', value: 'zh-HK', url: baseURL! }]);
        const copy = JSON.parse(fs.readFileSync('messages/zh-HK.json', 'utf8')).Join;
        const fixture = JSON.parse(fs.readFileSync('tests/fixtures/synthetic-membership-policy.json', 'utf8'));
        const path = '/zh/join/checkout?membership_id=' + membership;
        expect((await page.goto(path))?.status()).toBe(200);
        await expect(page.getByText(fixture.localeContent['zh-HK'], { exact: true })).toBeVisible();
        const checkbox = page.getByRole('checkbox', { name: copy.policy.accept });
        await expect(checkbox).not.toBeChecked();
        await page.locator('form').filter({ has: checkbox }).evaluate((form: HTMLFormElement) => { form.noValidate = true; form.requestSubmit(); });
        await expect(page.getByRole('alert').filter({ hasText: copy.policy.required })).toBeVisible();
        expect((await pool.query('SELECT count(*)::int AS count FROM billing_attempts WHERE membership_id=$1', [membership])).rows).toEqual([{ count: 0 }]);
        expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='membership.policy.accepted'", [application])).rows).toEqual([{ count: 0 }]);
        await checkbox.focus();
        await page.keyboard.press('Space');
        await expect(checkbox).toBeChecked();
        await page.getByRole('button', { name: copy.checkoutSummary.continuePayment, exact: true }).focus();
        await page.keyboard.press('Enter');
        await page.waitForURL(url => url.hostname === 'checkout.stripe.com');
        const attempts = (await pool.query('SELECT stripe_checkout_session_id FROM billing_attempts WHERE membership_id=$1', [membership])).rows;
        expect(attempts).toHaveLength(1);
        const session = await stripe.checkout.sessions.retrieve(attempts[0].stripe_checkout_session_id);
        expect(session.livemode).toBe(false);
        expect(session.status).toBe('open');
        expect(session.metadata?.applicationId).toBe(application);
        expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='membership.policy.accepted'", [application])).rows).toEqual([{ count: 1 }]);
        expect((await pool.query('SELECT status FROM memberships WHERE id=$1', [membership])).rows).toEqual([{ status: 'pending_payment' }]);
        await page.goto(path);
        await expect(page.getByRole('status').filter({ hasText: copy.policy.accepted })).toBeVisible();
        await expect(page.getByRole('checkbox', { name: copy.policy.accept })).toHaveCount(0);
        await page.screenshot({ path: evidence + 'zh-HK-policy-accepted.png' });
        await context.addCookies([{ name: 'NEXT_LOCALE', value: 'en', url: baseURL! }]);
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/join/checkout?membership_id=' + membership);
        await expect(page.getByText(fixture.localeContent.en, { exact: true })).toBeVisible();
        await page.screenshot({ path: evidence + 'en-policy-mobile.png' });
        fs.writeFileSync(evidence + 'browser.json', JSON.stringify({ checkedAt: new Date().toISOString(), environment: 'confirmed isolated DB/Auth; actual Stripe TEST checkout', syntheticPolicy: true, associationPolicyApproved: false, uncheckedAttempts: 0, uncheckedReceipts: 0, confirmedReceipts: 1, attempts: 1, providerSession: 'cs_' + createHash('sha256').update(session.id).digest('hex').slice(0, 12), providerMode: 'test', membershipAfter: 'pending_payment', keyboard: true, locales: ['en', 'zh-HK'], mobileWidth: 390, providerMessages: false, production: false, cleanup: 'exact newly created open TEST checkout expired; own application/membership/receipt deleted; source registry and local env restored by runner' }, null, 2));
    });
});
