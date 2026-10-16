import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,test} from '@playwright/test';
import {signInRemediationIdentity} from '../fixtures/full-remediation-browser';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '../../scripts/lib/acceptance-guard';
const id=randomUUID();const evidence='docs/audits/hkwtia-2026-10-01-remediation/evidence/t06/';let pool:Pool;
test.use({trace:'off',video:'off'});
test.describe('isolated special membership entry',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Requires confirmed isolated DB/Auth and synthetic identities');
 test.beforeAll(async()=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
  pool=new Pool({connectionString:url});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
  await pool.query('INSERT INTO profiles(id,auth_user_id,email,display_name,role) VALUES($1,$1,$2,$3,$4)',[id,'fr-grant-'+id+'@example.test','Synthetic grant target','member']);
 });
 test.afterAll(async()=>{if(pool){await pool.query("DELETE FROM audit_events WHERE action='membership.grant.created' AND metadata->>'targetId'=$1",[id]);await pool.query('DELETE FROM profiles WHERE id=$1',[id]);await pool.end();}});
 for(const role of ['STAFF','EXCO','SUPERADMIN']as const)test(role+' has no indefinite grant entry',async({page,context,baseURL})=>{
  await signInRemediationIdentity(context,baseURL!,role);const zh=role!=='SUPERADMIN';await context.addCookies([{name:'NEXT_LOCALE',value:zh?'zh-HK':'en',url:baseURL!}]);await page.setViewportSize({width:zh?1440:390,height:960});
  const response=await page.goto((zh?'/zh':'')+'/admin/members/'+id);expect(response?.status()).toBe(200);
  await expect(page.getByText(zh?/舊有無限期贈予入口已停用/:/old indefinite grant entry is retired/)).toBeVisible();
  expect(await page.locator('form[data-testid="membership-comp-form"]').count()).toBe(0);
  const form=page.locator('form').filter({has:page.locator('[name="reason"]')});
  if(role==='SUPERADMIN'){
   await expect(form).toBeVisible();const requestKey=await form.locator('input[name="idempotencyKey"]').inputValue();expect(requestKey).toMatch(/^[0-9a-f-]{36}$/);
   await form.locator('[name="planCode"]').selectOption('community');await form.locator('[name="effectiveAt"]').fill('2040-10-01T00:00');await form.locator('[name="expiresAt"]').fill('2041-10-01T00:00');await form.locator('[name="reason"]').fill('Approved synthetic isolated acceptance');
   await form.getByRole('button',{name:'Create special membership',exact:true}).click();await expect(form.getByRole('status')).toHaveText('Finite grant created.');
   const grants=(await pool.query('SELECT id,grant_actor_profile_id,grant_reason,grant_effective_at,grant_expires_at,stripe_subscription_id FROM memberships WHERE owner_user_id=$1',[id])).rows;
   expect(grants).toHaveLength(1);expect(grants[0].grant_actor_profile_id).toBe('m2-superadmin-01');expect(grants[0].grant_reason).toBe('Approved synthetic isolated acceptance');expect(grants[0].stripe_subscription_id).toBeNull();
   const receipts=(await pool.query("SELECT metadata->>'requestKey' AS key FROM audit_events WHERE target_id=$1 AND action='membership.grant.created'",[grants[0].id])).rows;expect(receipts).toEqual([{key:requestKey}]);
  }else await expect(form).toHaveCount(0);
  await page.getByText(zh?/舊有無限期贈予入口已停用/:/old indefinite grant entry is retired/).scrollIntoViewIfNeeded();await page.screenshot({path:evidence+role.toLowerCase()+'.png',mask:[page.locator('a[href^="mailto:"]')]});
  fs.writeFileSync(evidence+role.toLowerCase()+'.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated DB/Auth',role,legacyWriteVisible:false,finiteWriteVisible:role==='SUPERADMIN',finiteGrantSubmitted:role==='SUPERADMIN',provider:'synthetic password',production:false,cleanup:'exact generated synthetic profile and its grant audit only'},null,2));
 });
});
