import fs from 'node:fs';
import {Pool} from 'pg';
import {expect,test} from '@playwright/test';
import {signInRemediationIdentity} from '../fixtures/full-remediation-browser';
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from '../../scripts/lib/acceptance-guard';
let pool:Pool;let originals:{id:string;status:string}[]=[];
const evidence='docs/audits/hkwtia-2026-10-01-remediation/evidence/t08/';
test.use({trace:'off',video:'off'});
test.describe('isolated terminal membership billing access',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Confirmed isolated DB/Auth required');
 test.beforeAll(async({request,baseURL})=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
  expect(process.env.M2_TEST_MEMBER_EMAIL).toMatch(/@.*example\.test$/);expect(new URL(baseURL!).hostname).toBe('localhost');
  const response=await request.post('/api/auth/sign-in/email',{headers:{Origin:baseURL!},data:{email:process.env.M2_TEST_MEMBER_EMAIL,password:process.env.M2_TEST_MEMBER_PASSWORD,callbackURL:'/portal/billing'}});
  expect(response.status()).toBe(200);const authId=(await response.json()).user.id;
  pool=new Pool({connectionString:url});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS count FROM acceptance_sentinel')).rows[0].count));
  const profiles=(await pool.query("SELECT id FROM profiles WHERE auth_user_id=$1 AND role='member'",[authId])).rows;expect(profiles).toHaveLength(1);
  originals=(await pool.query('SELECT id,status FROM memberships WHERE owner_user_id=$1 OR company_id IN (SELECT company_id FROM company_members WHERE user_id=$1 AND revoked_at IS NULL)',[profiles[0].id])).rows;expect(originals.length).toBeGreaterThan(0);expect(originals.length).toBeLessThan(20);
  fs.mkdirSync(evidence,{recursive:true});
 });
 test.afterAll(async()=>{if(pool){for(const row of originals)await pool.query('UPDATE memberships SET status=$2::membership_status WHERE id=$1',[row.id,row.status]);await pool.end();}});
 for(const[status,locale]of [['expired','zh-HK'],['cancelled','en']]as const)test(status+' history remains accessible without entitlements',async({page,context,baseURL})=>{
  await pool.query('UPDATE memberships SET status=$2::membership_status WHERE id=ANY($1::uuid[])',[originals.map(row=>row.id),status]);
  await signInRemediationIdentity(context,baseURL!,'MEMBER');await context.addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);await page.setViewportSize({width:locale==='en'?390:1440,height:960});
  const response=await page.goto((locale==='en'?'':'/zh')+'/portal/billing');expect(response?.status()).toBe(200);
  const copy=JSON.parse(fs.readFileSync('messages/'+locale+'.json','utf8'));await expect(page.getByRole('heading',{level:1,name:copy.Portal.billing.title})).toBeVisible();await expect(page.getByText(copy.Portal.status[status].label,{exact:true}).first()).toBeVisible();
  await expect(page.getByRole('button',{name:copy.Portal.billing.recover,exact:true})).toHaveCount(0);
  await expect(page.getByRole('link',{name:copy.Portal.billing.support,exact:true}).first()).toBeVisible();
  await page.getByRole('link',{name:copy.Portal.billing.support,exact:true}).first().focus();expect(await page.evaluate(()=>document.activeElement?.tagName)).toBe('A');
  await page.screenshot({path:evidence+locale+'-'+status+'.png'});
  fs.writeFileSync(evidence+locale+'-'+status+'.json',JSON.stringify({environment:'confirmed isolated DB/Auth',status,http:200,viewport:locale==='en'?390:1440,history:true,blindCheckout:false,keyboard:true,providerSend:false,production:false},null,2));
 });
});
