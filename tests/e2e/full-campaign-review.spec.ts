import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {expect,test} from '@playwright/test';
import {signInRemediationIdentity} from '../fixtures/full-remediation-browser';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '../../scripts/lib/acceptance-guard';
const target=randomUUID();const segments=[randomUUID(),randomUUID()];let pool:Pool;
const evidence='docs/audits/hkwtia-2026-10-01-remediation/evidence/t07/';
interface Copy {Admin:{segments:{queue:string};campaigns:{fields:{name:string};actions:{next:string;createDraft:string;submitForReview:string;approveEmail:string};ownDraft:string;reviewStale:string}}}
test.use({trace:'off',video:'off'});
test.describe('isolated reviewed communication entry',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Requires confirmed isolated DB/Auth and synthetic identities');
 test.beforeAll(async()=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
  pool=new Pool({connectionString:url});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
  await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role,consent_marketing) VALUES($1,$1,$2,'Synthetic campaign browser target','member',true)",[target,'fr-campaign-'+target+'@example.test']);
  await pool.query("INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit) VALUES($1,'community','active',1)",[target]);
  for(const segment of segments)await pool.query("INSERT INTO saved_segments(id,owner_profile_id,name_en,filter_version,filters) VALUES($1,'m2-staff-01',$2,2,$3::jsonb)",[segment,'Synthetic reviewed '+segment,JSON.stringify({audience:'members',profileIds:[target]})]);
  fs.mkdirSync(evidence,{recursive:true});
 });
 test.afterAll(async()=>{if(pool){const ids=(await pool.query('SELECT id FROM campaigns WHERE segment_id=ANY($1::uuid[])',[segments])).rows.map(row=>row.id);await pool.query('DELETE FROM audit_events WHERE target_id=ANY($1::text[])',[ids]);await pool.query('DELETE FROM campaigns WHERE segment_id=ANY($1::uuid[])',[segments]);await pool.query('DELETE FROM saved_segments WHERE id=ANY($1::uuid[])',[segments]);await pool.query('DELETE FROM profiles WHERE id=$1',[target]);await pool.end();}});
 for(const[locale,index]of ['zh-HK','en'].map((locale,index)=>[locale,index]as const))test(locale+' GET is read-only; final draft and stale/current two-person approval',async({page,context,browser,baseURL})=>{
  test.setTimeout(90_000);const copy=JSON.parse(fs.readFileSync('messages/'+locale+'.json','utf8')) as Copy;const segment=segments[index];const prefix=locale==='en'?'':'/zh';
  await signInRemediationIdentity(context,baseURL!,'STAFF');await context.addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);await page.setViewportSize({width:locale==='en'?390:1440,height:960});
  const before=Number((await pool.query('SELECT count(*) AS count FROM campaigns WHERE segment_id=$1',[segment])).rows[0].count);
  await page.goto(prefix+'/admin/segments');const item=page.getByRole('listitem').filter({hasText:'Synthetic reviewed '+segment});const entry=item.getByRole('link',{name:copy.Admin.segments.queue,exact:true});
  await expect(entry).toBeVisible();await entry.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/admin\/campaigns\?/);
  expect(Number((await pool.query('SELECT count(*) AS count FROM campaigns WHERE segment_id=$1',[segment])).rows[0].count)).toBe(before);
  const name='Synthetic browser communication '+segment;await page.getByLabel(copy.Admin.campaigns.fields.name,{exact:true}).fill(name);
  const wizard=page.locator('form[method="get"]').filter({has:page.locator('input[name="campaignDraft"]')});const next=wizard.getByRole('button',{name:copy.Admin.campaigns.actions.next,exact:true});
  for(const step of ['channel','template','segment','preview']){await next.click();await expect(page).toHaveURL(new RegExp('step='+step));if(step==='template')await wizard.locator('select[name="template"]').selectOption('member-update');if(step==='segment')await wizard.locator('select[name="segmentId"]').selectOption(segment);}
  expect(Number((await pool.query('SELECT count(*) AS count FROM campaigns WHERE segment_id=$1',[segment])).rows[0].count)).toBe(before);
  await page.getByRole('button',{name:copy.Admin.campaigns.actions.createDraft,exact:true}).click();await expect(page.getByRole('heading',{level:1,name,exact:true})).toBeVisible();
  const campaign=(await pool.query('SELECT id,status FROM campaigns WHERE segment_id=$1',[segment])).rows;expect(campaign).toHaveLength(1);expect(campaign[0].status).toBe('draft');
  const id=campaign[0].id;expect((await pool.query('SELECT count(*)::int AS count FROM campaign_recipients WHERE campaign_id=$1',[id])).rows).toEqual([{count:1}]);
  await page.getByRole('button',{name:copy.Admin.campaigns.actions.submitForReview,exact:true}).click();await expect(page.getByText(copy.Admin.campaigns.ownDraft,{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:copy.Admin.campaigns.actions.approveEmail,exact:true})).toHaveCount(0);
  const reviewer=await browser.newContext({baseURL,viewport:{width:locale==='en'?390:1440,height:960}});
  try{await signInRemediationIdentity(reviewer,baseURL!,'EXCO');await reviewer.addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);const review=await reviewer.newPage();await review.goto(prefix+'/admin/campaigns/'+id);
   const revision=await review.locator('[name="expectedRevision"]').inputValue();expect(revision).toMatch(/^[a-f0-9]{64}$/);await pool.query("UPDATE campaigns SET name=name||' changed' WHERE id=$1",[id]);
   await review.getByRole('button',{name:copy.Admin.campaigns.actions.approveEmail,exact:true}).click();await expect(review.getByRole('alert').filter({hasText:copy.Admin.campaigns.reviewStale})).toBeVisible();
   expect((await pool.query('SELECT status,reviewed_at FROM campaigns WHERE id=$1',[id])).rows).toEqual([{status:'review',reviewed_at:null}]);
   const current=await review.locator('[name="expectedRevision"]').inputValue();expect(current).not.toBe(revision);
   await review.getByRole('button',{name:copy.Admin.campaigns.actions.approveEmail,exact:true}).focus();await review.keyboard.press('Enter');await expect(review.locator('[name="expectedRevision"]')).toHaveCount(0);
   expect((await pool.query('SELECT status,reviewed_by_profile_id FROM campaigns WHERE id=$1',[id])).rows).toEqual([{status:'queued',reviewed_by_profile_id:'m2-exco-01'}]);
   expect((await pool.query("SELECT metadata->>'reviewRevision' AS revision FROM audit_events WHERE target_id=$1 AND action='campaign.review.approved'",[id])).rows).toEqual([{revision:current}]);
   await expect(review.getByText(copy.Admin.campaigns.reviewStale,{exact:true})).toHaveCount(0);
   await review.screenshot({path:evidence+locale+'-review.png',mask:[review.locator('a[href^="mailto:"]')]});
   fs.writeFileSync(evidence+locale+'.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated DB/Auth',locale,viewport:locale==='en'?390:1440,getWrites:0,finalDraft:1,snapshotRecipients:1,authorApproval:false,staleApproval:'rejected',currentApproval:'queued',reviewer:'synthetic ExCo',keyboard:true,providerSend:false,production:false},null,2));
  }finally{await reviewer.close();}
 });
});
