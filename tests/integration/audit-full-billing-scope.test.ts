// @vitest-environment node
import {randomUUID} from 'node:crypto';
import {drizzle} from 'drizzle-orm/node-postgres';
import {Pool} from 'pg';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '@/scripts/lib/acceptance-guard';
import type {Database} from '@/lib/db/repos/common';
const db=vi.hoisted(()=>({current:null as Database|null}));
vi.mock('@/lib/db/repos/common',async(importOriginal)=>({...await importOriginal<typeof import('@/lib/db/repos/common')>(),getDb:async()=>{if(!db.current)throw Error('ISOLATED_DB_NOT_READY');return db.current;}}));
import {membershipsRepository} from '@/lib/db/repos/memberships';
import {readPaymentCorrelation} from '@/lib/db/repos/billing-reconciliation';
import {jobsRepository} from '@/lib/db/repos/jobs';
import type {WebhookLifecycleCommand} from '@/lib/billing/webhook-service';
import {billingAttemptsRepository} from '@/lib/db/repos/billing-attempts';
const ids=Array.from({length:5},()=>randomUUID());const company=randomUUID(),personal=randomUUID(),corporate=randomUUID(),pending=randomUUID(),application=randomUUID();let pool:Pool;const eventRefs:string[]=[];
const actor=(index:number)=>({kind:'member' as const,profileId:ids[index],userId:'auth-'+ids[index]});
describe.skipIf(process.env.FULL_REMEDIATION_ACCEPTANCE_SEED!=='true')('actual isolated billing and duplicate subscription scope',()=>{
 beforeAll(async()=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  if(new URL(url).hostname!=='ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech'||process.env.NEON_PROJECT_ID!=='solitary-wave-52860119')throw Error('UNCONFIRMED_ISOLATED_TARGET');
  pool=new Pool({connectionString:url});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));db.current=drizzle(pool) as unknown as Database;
  for(const id of ids)await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,'Synthetic billing scope','member')",[id,'fr-billing-'+id+'@example.test']);
  await pool.query("INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic billing scope','Synthetic billing scope')",[company]);
  for(const [index,role]of ['owner','admin','member','member'].entries())await pool.query('INSERT INTO company_members(company_id,user_id,role,revoked_at) VALUES($1,$2,$3,$4)',[company,ids[index],role,index===3?new Date():null]);
  await pool.query("INSERT INTO memberships(id,owner_user_id,plan_code,status,seat_limit) VALUES($1,$2,'community','expired',1)",[personal,ids[4]]);
  await pool.query("INSERT INTO memberships(id,company_id,plan_code,status,seat_limit) VALUES($1,$2,'corporate','cancelled',25)",[corporate,company]);
  await pool.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,status) VALUES($1,$2,'startup','pending_payment')",[application,ids[4]]);
  await pool.query("INSERT INTO memberships(id,owner_user_id,application_id,plan_code,status,seat_limit,stripe_customer_id,stripe_subscription_id) VALUES($1,$2,$3,'startup','pending_payment',5,'cus_existing_test','sub_existing_test')",[pending,ids[4],application]);
 });
 afterAll(async()=>{if(pool){await pool.query('DELETE FROM jobs WHERE run_key=ANY($1::text[])',[eventRefs]);await pool.query('DELETE FROM audit_events WHERE target_id=ANY($1::text[])',[[personal,corporate,pending]]);await pool.query('DELETE FROM memberships WHERE id=ANY($1::uuid[])',[[personal,corporate,pending]]);await pool.query('DELETE FROM membership_applications WHERE id=$1',[application]);await pool.query('DELETE FROM companies WHERE id=$1',[company]);await pool.query('DELETE FROM profiles WHERE id=ANY($1::text[])',[ids]);await pool.end();}db.current=null;});
 it('returns an expired personal history without active-entitlement filters',async()=>{const records=await membershipsRepository.listBilling(actor(4));expect(records.map(row=>row.id).sort()).toEqual([personal,pending].sort());expect(await membershipsRepository.getBillingAccess(actor(4),personal)).toMatchObject({status:'expired'});});
 it.each([0,1])('permits trusted company owner/admin %s for terminal billing',async(index)=>{expect((await membershipsRepository.listBilling(actor(index))).map(row=>row.id)).toEqual([corporate]);expect(await membershipsRepository.getBillingAccess(actor(index),corporate)).toMatchObject({status:'cancelled'});});
 it.each([2,3,4])('never exposes company billing to an ordinary/revoked/foreign member %s',async(index)=>{expect((await membershipsRepository.listBilling({...actor(index),companyRoles:{[company]:'owner'}})).some(row=>row.id===corporate)).toBe(false);await expect(membershipsRepository.getBillingAccess(actor(index),corporate)).rejects.toThrow('FORBIDDEN');});
 it('serializes a pending row already linked to Stripe without creating another attempt',async()=>{
  await expect(billingAttemptsRepository.claimActive(actor(4),pending,'price_synthetic_test')).rejects.toThrow('MEMBERSHIP_PAYMENT_RECONCILIATION_REQUIRED');
  await expect(billingAttemptsRepository.startNewAttempt(actor(4),pending,'price_synthetic_test','expired',{expectedCurrentAttemptId:randomUUID(),recoveryRequestId:randomUUID()})).rejects.toThrow('MEMBERSHIP_PAYMENT_RECONCILIATION_REQUIRED');
  expect((await pool.query('SELECT count(*)::int AS count FROM billing_attempts WHERE membership_id=$1',[pending])).rows).toEqual([{count:0}]);
 });
 it('scopes the default operator read to the selected Member360 target and refuses staff',async()=>{
  const root={kind:'superadmin' as const,profileId:'m2-superadmin-01',userId:'synthetic-auth-root'};
  expect(await readPaymentCorrelation(root,ids[4],pending)).toMatchObject({id:pending,applicationId:application});
  expect(await readPaymentCorrelation(root,ids[0],pending)).toBeNull();
  await expect(readPaymentCorrelation({kind:'staff',profileId:'m2-staff-01',userId:'synthetic-auth-staff'},ids[4],pending)).rejects.toThrow('FORBIDDEN');
 });
 it('replays one existing correlated checkout once, with an atomic operator receipt',async()=>{
  const event='evt_synthetic_'+randomUUID().replaceAll('-',''),requestId=randomUUID();eventRefs.push(event);
  await pool.query("UPDATE memberships SET stripe_customer_id=NULL,stripe_subscription_id=NULL WHERE id=$1",[pending]);
  await pool.query("INSERT INTO billing_attempts(membership_id,attempt_number,idempotency_key,price_reference,state,stripe_checkout_session_id) VALUES($1,1,$2,'price_synthetic_test','active','cs_synthetic_existing')",[pending,'synthetic-'+pending]);
  const command:WebhookLifecycleCommand={eventId:event,eventType:'checkout.session.completed',eventCreated:1760000000,membershipId:pending,applicationId:application,planCode:'startup',stripeCustomerId:'cus_synthetic_existing',stripeSubscriptionId:'sub_synthetic_existing',stripeCheckoutSessionId:'cs_synthetic_existing',nextStatus:'active',billingPeriodStart:null,billingPeriodEnd:null,cancelAtPeriodEnd:false,isRenewal:false};
  const manual={actor:{kind:'superadmin' as const,profileId:'m2-superadmin-01',userId:'synthetic-auth-root'},requestId,reasonCode:'paid_not_active' as const};
  const system={kind:'system' as const,userId:null,source:'stripe-webhook' as const};
  const result=await Promise.all([jobsRepository.processWebhookLifecycle(system,command,undefined,manual),jobsRepository.processWebhookLifecycle(system,command,undefined,manual)]);
  expect(result).toEqual(['processed','processed']);
  expect((await pool.query('SELECT status,stripe_subscription_id FROM memberships WHERE id=$1',[pending])).rows).toEqual([{status:'active',stripe_subscription_id:'sub_synthetic_existing'}]);
  expect((await pool.query("SELECT action,actor_type,actor_user_id,metadata->>'disposition' AS disposition FROM audit_events WHERE target_id=$1 AND action='membership.payment.reconciled'",[pending])).rows).toEqual([{action:'membership.payment.reconciled',actor_type:'superadmin',actor_user_id:'m2-superadmin-01',disposition:'processed'}]);
  expect((await pool.query("SELECT count(*)::int AS count FROM jobs WHERE run_key=$1 AND state='completed'",[event])).rows).toEqual([{count:1}]);
  await expect(jobsRepository.processWebhookLifecycle(system,command,undefined,{...manual,reasonCode:'webhook_retry'})).rejects.toThrow('PAYMENT_RECONCILIATION_REQUEST_CONFLICT');
  const old={...command,eventId:'evt_synthetic_'+randomUUID().replaceAll('-',''),eventType:'customer.subscription.updated' as const,eventCreated:1759999999,nextStatus:'past_due' as const,stripeCheckoutSessionId:null};
  eventRefs.push(old.eventId);expect(await jobsRepository.processWebhookLifecycle(system,old)).toBe('processed');
  expect((await pool.query('SELECT status FROM memberships WHERE id=$1',[pending])).rows).toEqual([{status:'active'}]);
  const mismatch={...old,eventId:'evt_synthetic_'+randomUUID().replaceAll('-',''),eventCreated:1760000001,stripeCustomerId:'cus_foreign'};
  eventRefs.push(mismatch.eventId);const failedRequest=randomUUID();await expect(jobsRepository.processWebhookLifecycle(system,mismatch,undefined,{...manual,requestId:failedRequest})).rejects.toThrow('INVALID_WEBHOOK_EVENT');
  expect((await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE request_id=$1',[failedRequest])).rows).toEqual([{count:0}]);
  await pool.query('DELETE FROM jobs WHERE run_key=ANY($1::text[])',[[event,old.eventId,mismatch.eventId]]);
 });

});
