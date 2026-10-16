import fs from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
import {Pool} from 'pg';
import Stripe from 'stripe';
import {expect,test} from '@playwright/test';
import {STRIPE_API_VERSION} from '../../lib/billing/stripe-api-version';
import {signInRemediationIdentity} from '../fixtures/full-remediation-browser';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '../../scripts/lib/acceptance-guard';
const profile=randomUUID(),membership=randomUUID(),application=randomUUID();let pool:Pool,stripe:Stripe,customer:Stripe.Customer|undefined,subscription:Stripe.Subscription|undefined;let event:Stripe.Event|undefined;let invoice:Stripe.Invoice|undefined;
const evidence='docs/audits/hkwtia-2026-10-01-remediation/evidence/t08/';const mask=(id:string)=>id.split('_')[0]+'_'+createHash('sha256').update(id).digest('hex').slice(0,12);
test.use({trace:'off',video:'off'});
test.describe('actual isolated provider event and authorized payment repair',()=>{
 test.skip(process.env.RUN_STRIPE_TEST_ACCEPTANCE!=='1','Explicit Stripe test-mode opt-in required');
 test.beforeAll(async()=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');expect(process.env.STRIPE_TEST_SECRET_KEY).toMatch(/^sk_test_/);expect(process.env.STRIPE_SECRET_KEY===process.env.STRIPE_TEST_SECRET_KEY).toBe(true);expect(process.env.AUDIT_BATCH_WORKER_PAUSED).toBe('true');
  pool=new Pool({connectionString:url});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
  stripe=new Stripe(process.env.STRIPE_TEST_SECRET_KEY!,{apiVersion:STRIPE_API_VERSION});
  const price=await stripe.prices.retrieve(process.env.STRIPE_TEST_STARTUP_PRICE_ID!);expect(price.livemode).toBe(false);expect(price.currency).toBe('hkd');expect(price.recurring).not.toBeNull();
  await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic paid reconciliation','member')",[profile,'fr-paid-'+profile+'@example.test']);
  await pool.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'startup','pending_payment')",[application,profile]);
  // No customer email: test provider generates an actual paid invoice without contacting an inbox.
  customer=await stripe.customers.create({description:'HKWTIA isolated synthetic acceptance '+profile,payment_method:'pm_card_visa',invoice_settings:{default_payment_method:'pm_card_visa'}},{idempotencyKey:'fr-paid-customer:'+profile});expect(customer.livemode).toBe(false);
  subscription=await stripe.subscriptions.create({customer:customer.id,items:[{price:price.id}],payment_behavior:'error_if_incomplete',metadata:{membershipId:membership,applicationId:application,planCode:'startup'}},{idempotencyKey:'fr-paid-subscription:'+membership});expect(subscription.livemode).toBe(false);expect(subscription.status).toBe('active');
  const invoiceId=typeof subscription.latest_invoice==='string'?subscription.latest_invoice:subscription.latest_invoice?.id;expect(invoiceId).toBeTruthy();invoice=await stripe.invoices.retrieve(invoiceId!);expect(invoice.livemode).toBe(false);expect(invoice.status).toBe('paid');expect(invoice.amount_paid).toBeGreaterThan(0);
  await pool.query("INSERT INTO memberships(id,owner_user_id,application_id,plan_code,status,seat_limit,stripe_customer_id,stripe_subscription_id) VALUES($1,$2,$3,'startup','pending_payment',5,$4,$5)",[membership,profile,application,customer.id,subscription.id]);
  const since=Math.floor(Date.now()/1000)-5;await stripe.subscriptions.update(subscription.id,{description:'Synthetic existing payment awaiting local activation'},{idempotencyKey:'fr-paid-event:'+membership});
  for(let attempt=0;attempt<20&&!event;attempt++){
   const events=await stripe.events.list({type:'customer.subscription.updated',created:{gte:since},limit:100});event=events.data.find(item=>(item.data.object as Stripe.Subscription).id===subscription!.id);if(!event)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  expect(event).toBeDefined();expect(event!.livemode).toBe(false);expect((event!.data.object as Stripe.Subscription).metadata.membershipId).toBe(membership);fs.mkdirSync(evidence,{recursive:true});
 });
 test.afterAll(async()=>{
  // Only exact newly created TEST resources are retired. Immutable provider test events remain.
  if(subscription)await stripe.subscriptions.cancel(subscription.id,{invoice_now:false,prorate:false});if(customer)await stripe.customers.del(customer.id);
  if(pool){await pool.query('DELETE FROM jobs WHERE run_key=$1',[event?.id??'none']);await pool.query('DELETE FROM audit_events WHERE target_id=$1',[membership]);await pool.query('DELETE FROM memberships WHERE id=$1',[membership]);await pool.query('DELETE FROM membership_applications WHERE id=$1',[application]);await pool.query('DELETE FROM profiles WHERE id=$1',[profile]);await pool.end();}
 });
 test('provider paid invoice → root replays original event → one activation and visible receipt',async({page,context,browser,baseURL})=>{
  expect(new URL(baseURL!).hostname).toBe('localhost');await signInRemediationIdentity(context,baseURL!,'SUPERADMIN');await context.addCookies([{name:'NEXT_LOCALE',value:'zh-HK',url:baseURL!}]);
  const copy=JSON.parse(fs.readFileSync('messages/zh-HK.json','utf8')).Admin.paymentReconciliation;await page.goto('/zh/admin/members/'+profile);
  await expect(page.getByRole('heading',{name:copy.title,exact:true})).toBeVisible();await page.getByLabel(copy.event,{exact:true}).fill(event!.id);await page.getByRole('button',{name:copy.submit,exact:true}).focus();await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({hasText:copy.processed})).toBeVisible();
  expect((await pool.query('SELECT status,stripe_customer_id,stripe_subscription_id FROM memberships WHERE id=$1',[membership])).rows).toEqual([{status:'active',stripe_customer_id:customer!.id,stripe_subscription_id:subscription!.id}]);
  expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE target_id=$1 AND action='stripe.webhook.processed'",[membership])).rows).toEqual([{count:1}]);
  expect((await pool.query("SELECT actor_type,actor_user_id,metadata->>'eventId' AS event FROM audit_events WHERE target_id=$1 AND action='membership.payment.reconciled'",[membership])).rows).toEqual([{actor_type:'superadmin',actor_user_id:'m2-superadmin-01',event:event!.id}]);
  await page.getByLabel(copy.event,{exact:true}).fill(event!.id);await page.getByRole('button',{name:copy.submit,exact:true}).click();await expect(page.getByRole('status').filter({hasText:copy.duplicate})).toBeVisible();
  expect((await pool.query('SELECT count(*)::int AS count FROM jobs WHERE run_key=$1',[event!.id])).rows).toEqual([{count:1}]);
  const staff=await browser.newContext({baseURL});try{await signInRemediationIdentity(staff,baseURL!,'STAFF');const staffPage=await staff.newPage();await staffPage.goto('/zh/admin/members/'+profile);await expect(staffPage.locator('input[name="eventId"]')).toHaveCount(0);}finally{await staff.close();}
  await page.screenshot({path:evidence+'zh-HK-provider-reconciliation.png',mask:[page.locator('input[name="eventId"]'),page.locator('a[href^="https://dashboard.stripe.com"]')]});
  fs.writeFileSync(evidence+'provider-reconciliation.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated DB/Auth; Stripe TEST',command:'RUN_STRIPE_TEST_ACCEPTANCE=1 PLAYWRIGHT_BASE_URL=http://localhost:3450 node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/e2e/full-member-payment-reconciliation.spec.ts --reporter=line',providerMode:'test',event:mask(event!.id),customer:mask(customer!.id),subscription:mask(subscription!.id),invoice:mask(invoice!.id),providerInvoice:'paid',appBefore:'pending_payment',appAfter:'active',ledgerCount:1,retry:'duplicate',auditActor:'synthetic superadmin',staffEntry:false,keyboard:true,customerEmail:null,providerMessages:false,compGrant:false,newCheckout:false,production:false,cleanup:'exact new test subscription cancelled and test customer deleted in afterAll; immutable test events retained'},null,2));
 });
});
