import assert from "node:assert/strict";
import {randomUUID, randomBytes, createHash} from "node:crypto";
import {readFileSync, writeFileSync, mkdirSync} from "node:fs";
import {setTimeout as delay} from "node:timers/promises";
import {Pool} from "pg";
import Stripe from "stripe";
import {chromium, request} from "playwright";
import {assertIsolatedSeedEnvironment, assertSeedSentinel} from "./lib/acceptance-guard.ts";

// Real test-mode hosted Checkout and provider-retrieved events. Replaying a
// verified provider payload with a test signature is explicitly NOT proof of
// automatic remote Stripe webhook delivery. No synthetic paid event is used.
const origin = "https://hkwtia-membership-lifecycle-20261003.vercel.app";
const evidenceRoot = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t14b/";
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 16);
const checks = [];
let stage = "isolation", pool, browser, hook, membershipId, applicationId, subscriptionId;
let sourceSha, deploymentId, succeeded = false;
async function providerEvent(stripe, type, objectId) {
  for (let i = 0; i < 30; i++) {
    const page = await stripe.events.list({type, limit: 100});
    const event = page.data.find(e => e.data.object.id === objectId);
    if (event) { assert.equal(event.livemode, false); return await stripe.events.retrieve(event.id); }
    await delay(1000);
  }
  throw Error("REAL_PROVIDER_EVENT_NOT_OBSERVED");
}
async function replay(stripe, event) {
  assert.equal(event.livemode, false);
  const payload = JSON.stringify(event);
  const signature = stripe.webhooks.generateTestHeaderString({payload, secret: process.env.STRIPE_TEST_WEBHOOK_SECRET});
  const response = await hook.post(origin + "/api/stripe/webhook", {headers: {"Content-Type": "application/json", "stripe-signature": signature}, data: payload});
  assert.equal(response.status(), 200);
  const body = await response.json(); assert.equal(body.received, true);
  return body.result;
}
try {
  assert.equal(process.env.FULL_FIX_STRIPE_TEST_ACCEPTANCE, "1", "EXPLICIT_TEST_PROVIDER_OPT_IN_REQUIRED");
  assert.equal(process.env.AUDIT_BATCH_WORKER_PAUSED, "true");
  const url = assertIsolatedSeedEnvironment(process.env, {prefix: "FULL_REMEDIATION", flag: "FULL_REMEDIATION_ACCEPTANCE_SEED", hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});
  assert.equal(new URL(url).hostname, "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");
  assert.equal(new URL(process.env.NEON_AUTH_BASE_URL).hostname, "ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech");
  assert(/^sk_test_/.test(process.env.STRIPE_TEST_SECRET_KEY ?? ""));
  assert.equal(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_TEST_SECRET_KEY);
  assert.equal(process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_TEST_WEBHOOK_SECRET);
  const deployment = JSON.parse(readFileSync(".playwright/full-fix-t14b-preview-deployment-safe.json", "utf8"));
  const runtime = JSON.parse(readFileSync(".playwright/full-fix-t14b-preview-runtime-safe.json", "utf8"));
  assert.equal(deployment.target, null); assert.equal(deployment.state, "READY"); assert.equal(deployment.origin, origin);
  assert.equal(runtime.sourceSha, deployment.sourceSha); assert(runtime.checks.some(c => c.dbSourcePositivelyProven));
  assert.match(deployment.sourceSha, /^[a-f0-9]{40}$/); sourceSha = deployment.sourceSha; deploymentId = deployment.id;
  pool = new Pool({connectionString: url, query_timeout: 15000});
  await assertSeedSentinel("FULL_REMEDIATION", async () => Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n));
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations")).rows[0].n), 59);
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'")).rows[0].n), 0);
  const before = (await pool.query("SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM ai_budget_reservations) AS budgets")).rows;
  const stripe = new Stripe(process.env.STRIPE_TEST_SECRET_KEY);
  stage = "provider-test-account"; assert.equal((await stripe.balance.retrieve()).livemode, false);
  const price = await stripe.prices.retrieve(process.env.STRIPE_TEST_CORPORATE_PRICE_ID);
  assert.equal(price.livemode, false); assert.equal(price.active, true); assert.equal(price.currency, "hkd");
  assert.equal(price.recurring?.interval, "year"); assert.equal(price.recurring?.interval_count, 1);
  checks.push({case: "real provider account and configured recurring price", testMode: true, currency: "hkd", cadence: "annual", priceRef: hash(price.id)});
  browser = await chromium.launch();
  const protection = ".playwright/full-fix-t14b-preview-protection-state.json";
  const context = await browser.newContext({storageState: protection});
  // This context contains only Vercel Preview protection; no member session is
  // used to authenticate the webhook. Stripe signature authenticates the event.
  hook = await request.newContext({storageState: protection});
  const run = randomUUID(), email = "t14b-provider-" + run + "@membership.example.test";
  stage = "fresh-password-auth";
  const login = await context.request.post(origin + "/api/auth/sign-up/email", {headers: {Origin: origin, Referer: origin + "/member-login"}, data: {email, password: randomBytes(24).toString("base64url") + "X!9", name: "Synthetic T14B Provider"}});
  assert.equal(login.status(), 200); const identity = await login.json(), authId = identity.user?.id ?? identity.data?.user?.id;
  assert.equal(typeof authId, "string"); const profileId = "t14b-provider-" + run;
  await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,whatsapp_opt_in) VALUES($1,$2,$3,'Synthetic T14B Provider','member','zh-HK',false)", [profileId, authId, email]);
  applicationId = randomUUID();
  await pool.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,status,current_step) VALUES($1,$2,'corporate','draft','profile')", [applicationId, profileId]);
  const zh = JSON.parse(readFileSync("messages/zh-HK.json", "utf8")), page = await context.newPage();
  stage = "native-company-submit";
  await page.goto(origin + "/zh/join/profile?" + new URLSearchParams({plan: "corporate", application: applicationId}));
  await page.getByRole("button", {name: zh.Join.continue, exact: true}).click(); await page.waitForURL(/\/join\/company\?/);
  await page.getByLabel(zh.Join.fields.legalName, {exact: true}).fill("Synthetic T14B Provider " + hash(applicationId) + " Limited");
  await page.getByLabel(zh.Join.fields.companyDisplayName, {exact: true}).fill("Synthetic T14B Provider " + hash(applicationId));
  await page.getByRole("button", {name: zh.Join.submitApplication, exact: true}).click(); await page.waitForURL(/\/join\/checkout\?membership_id=/);
  membershipId = new URL(page.url()).searchParams.get("membership_id"); assert(membershipId);
  const owned = (await pool.query("SELECT status,application_id,plan_code FROM memberships WHERE id=$1", [membershipId])).rows;
  assert.deepEqual(owned, [{status: "pending_payment", application_id: applicationId, plan_code: "corporate"}]);
  const attempts = async () => (await pool.query("SELECT id,state,stripe_checkout_session_id,price_reference FROM billing_attempts WHERE membership_id=$1 ORDER BY attempt_number", [membershipId])).rows;
  assert.equal((await attempts()).length, 0);
  stage = "native-hosted-checkout";
  await page.getByRole("button", {name: zh.Join.checkoutSummary.continuePayment, exact: true}).click(); await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, {timeout: 60000});
  const first = await attempts(); assert.equal(first.length, 1); assert.equal(first[0].price_reference, price.id);
  const session = await stripe.checkout.sessions.retrieve(first[0].stripe_checkout_session_id);
  assert.equal(session.livemode, false); assert.equal(session.mode, "subscription"); assert.equal(session.currency, "hkd");
  assert.equal(session.client_reference_id, membershipId); assert.equal(session.metadata.membershipId, membershipId); assert.equal(session.metadata.applicationId, applicationId);
  assert.equal(new URL(session.cancel_url).origin, origin);
  stage = "return-and-resume-same-checkout";
  await page.goto(session.cancel_url); await page.getByRole("button", {name: zh.Join.checkoutSummary.continuePayment, exact: true}).click(); await page.waitForURL(/^https:\/\/checkout\.stripe\.com\//, {timeout: 60000});
  assert.deepEqual(await attempts(), first); assert.equal((await stripe.checkout.sessions.retrieve(session.id)).status, "open");
  checks.push({case: "unpaid return resumes same real checkout", attempts: 1, checkoutRef: hash(session.id), entitlement: "pending_payment", providerSessionExpired: false});
  stage = "real-stripe-test-card-submit";
  await page.locator("#email").fill(email); await page.locator("#cardNumber").fill("4242424242424242"); await page.locator("#cardExpiry").fill("1250"); await page.locator("#cardCvc").fill("123");
  if (await page.locator("#billingName").count()) await page.locator("#billingName").fill("Synthetic T14B Test");
  if (await page.locator("#billingCountry").count()) await page.locator("#billingCountry").selectOption("HK");
  if (await page.locator("#billingPostalCode").isVisible()) await page.locator("#billingPostalCode").fill("00000");
  await page.locator("button.SubmitButton").click();
  let paid;
  for (let i = 0; i < 90; i++) { paid = await stripe.checkout.sessions.retrieve(session.id); if (paid.payment_status === "paid") break; await delay(1000); }
  assert.equal(paid.livemode, false); assert.equal(paid.payment_status, "paid"); assert.equal(paid.status, "complete");
  subscriptionId = typeof paid.subscription === "string" ? paid.subscription : paid.subscription?.id; assert(subscriptionId);
  writeFileSync(".playwright/full-fix-t14b-provider-owned-private.json", JSON.stringify({membershipId, applicationId, subscriptionId, checkoutId: session.id, production: false}), {mode: 0o600});
  stage = "real-provider-event-signed-replay";
  const event = await providerEvent(stripe, "checkout.session.completed", session.id);
  const result = await replay(stripe, event), duplicate = await replay(stripe, event);
  assert(["processed", "duplicate"].includes(result)); assert.equal(duplicate, "duplicate");
  const activated = (await pool.query("SELECT status,stripe_subscription_id,application_id FROM memberships WHERE id=$1", [membershipId])).rows;
  assert.deepEqual(activated, [{status: "active", stripe_subscription_id: subscriptionId, application_id: applicationId}]);
  assert.equal((await attempts()).length, 1); assert.equal((await attempts())[0].state, "completed");
  checks.push({case: "actual hosted payment and provider event duplicate", paymentStatus: paid.payment_status, status: "active", amountTotalHkdCents: paid.amount_total, eventRef: hash(event.id), eventReplayResults: [result, duplicate], attempts: 1, actualProviderPayload: true, automaticRemoteWebhookVerified: false});
  stage = "native-authoritative-paid-completion";
  await page.goto(origin + "/zh/join/complete?" + new URLSearchParams({membership_id: membershipId})); await page.locator('[data-checkout-status="active"]').waitFor();
  mkdirSync(evidenceRoot, {recursive: true}); await page.screenshot({path: evidenceRoot + "zh-HK-provider-paid.png"});
  stage = "owned-test-subscription-cleanup";
  const sub = await stripe.subscriptions.retrieve(subscriptionId); assert.equal(sub.livemode, false); assert.equal(sub.metadata.membershipId, membershipId); assert.equal(sub.metadata.applicationId, applicationId);
  const cancelled = await stripe.subscriptions.cancel(subscriptionId); assert.equal(cancelled.livemode, false); assert.equal(cancelled.status, "canceled");
  const cancellation = await providerEvent(stripe, "customer.subscription.deleted", subscriptionId); await replay(stripe, cancellation);
  assert.deepEqual((await pool.query("SELECT status FROM memberships WHERE id=$1", [membershipId])).rows, [{status: "cancelled"}]);
  assert.deepEqual((await pool.query("SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM ai_budget_reservations) AS budgets")).rows, before);
  checks.push({case: "owned test subscription cancelled and reconciled", provider: "canceled", app: "cancelled", refundsRequested: 0, messagesBudgetDelta: 0});
  succeeded = true;
} catch {
  // Assertion/provider errors may contain IDs, full URLs or credentials. Only
  // stage and hashed owned references leave the private test environment.
  process.exitCode = 1;
} finally {
  mkdirSync(evidenceRoot, {recursive: true});
  const receipt = {observedAt: new Date().toISOString(), sourceSha, deploymentId, origin, succeeded, failedStage: succeeded ? null : stage, checks, applicationRef: applicationId ? hash(applicationId) : null, membershipRef: membershipId ? hash(membershipId) : null, production: false, trueHostedCheckout: checks.some(c => c.paymentStatus === "paid"), automaticRemoteWebhookVerified: false, renewalProviderVerified: false, googleVerified: false, magicLinkVerified: false, secretsLogged: false, rawProviderPayloadLogged: false};
  writeFileSync(evidenceRoot + "stripe-test-provider.json", JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify({succeeded, stage, checks: checks.length, production: false, secretsLogged: false}));
  if (hook) await hook.dispose(); if (browser) await browser.close(); if (pool) await pool.end();
}
