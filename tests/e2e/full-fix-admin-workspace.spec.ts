import {test,expect,type BrowserContext} from "@playwright/test";
import {Pool} from "pg";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from "../../scripts/lib/acceptance-guard";
const en:typeof import("../../messages/en.json")=JSON.parse(readFileSync("messages/en.json","utf8"));
const zh:typeof import("../../messages/zh-HK.json")=JSON.parse(readFileSync("messages/zh-HK.json","utf8"));
type Fixture={sourceSha:string;origin:string;label:string;profileId:string;applicationId:string;queries:{count:number;query:string}[]};
let f:Fixture,pool:Pool,before:unknown;const checks:object[]=[];
const root="docs/audits/hkwtia-2026-10-03-full-fix/evidence/t18/";
async function login(context:BrowserContext,role:"STAFF"|"MEMBER"="STAFF") {
 const email=process.env['M2_TEST_'+role+'_EMAIL'],password=process.env['M2_TEST_'+role+'_PASSWORD'];expect(email).toMatch(/@.*example\.test$/);expect(Boolean(password)).toBe(true);
 const response=await context.request.post(f.origin+'/api/auth/sign-in/email',{headers:{Origin:f.origin,Referer:f.origin+'/admin-login'},data:{email,password}});expect(response.status()).toBe(200);
 const identity=await response.json();const id=identity.user?.id??identity.data?.user?.id;expect(typeof id).toBe('string');
 if(role==='STAFF')expect((await pool.query('SELECT role FROM profiles WHERE auth_user_id=$1',[id])).rows).toEqual([{role:'staff'}]);
}
test.use({trace:'off',video:'off',actionTimeout:30000});
test.describe('actual isolated administrative workspace',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Confirmed isolated DB/Auth and Preview required; skip is not acceptance');
 test.beforeAll(async({baseURL})=>{
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:'FULL_REMEDIATION',flag:'FULL_REMEDIATION_ACCEPTANCE_SEED',hostAllowlistVar:'FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST'});
  expect(new URL(url).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');expect(baseURL).toBe('https://hkwtia-admin-workspace-20261003.vercel.app');
  f=JSON.parse(readFileSync('.playwright/full-fix-t18-fixtures-private.json','utf8'));const d=JSON.parse(readFileSync('.playwright/full-fix-t18-preview-deployment-safe.json','utf8')),r=JSON.parse(readFileSync('.playwright/full-fix-t18-preview-runtime-safe.json','utf8'));
  expect(d.sourceSha).toBe(f.sourceSha);expect(r.sourceSha).toBe(f.sourceSha);expect(d.target).toBeNull();expect(f.origin).toBe(baseURL);expect(r.checks.some((c:{dbSourcePositivelyProven?:boolean})=>c.dbSourcePositivelyProven)).toBe(true);
  pool=new Pool({connectionString:url,query_timeout:15000});await assertSeedSentinel('FULL_REMEDIATION',async()=>Number((await pool.query('SELECT count(*) AS n FROM acceptance_sentinel')).rows[0].n));mkdirSync(root,{recursive:true});
  before=(await pool.query('SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS billing,(SELECT count(*) FROM ai_budget_reservations) AS budgets')).rows;
 });
 test.afterAll(async({browser},info)=>{void browser;if(!pool)return;try{
  const after=(await pool.query('SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM memberships) AS memberships,(SELECT count(*) FROM billing_attempts) AS billing,(SELECT count(*) FROM ai_budget_reservations) AS budgets')).rows;expect(after).toEqual(before);
  writeFileSync(root+'native-'+f.sourceSha.slice(0,8)+'-worker-'+info.workerIndex+'.json',JSON.stringify({sourceSha:f.sourceSha,origin:f.origin,observedAt:new Date().toISOString(),checks,actualNeonPasswordAuth:true,messagesMembershipBillingBudgetDelta:0,googleVerified:false,magicLinkVerified:false,realProviderRequests:0,production:false},null,2));
 }finally{await pool.end();}});
 for(const locale of ['en','zh-HK'] as const){const t=locale==='en'?en:zh,prefix=locale==='en'?'':'/zh';
  test(locale+' classified search and keyboard result open/back',async({page,context})=>{
   await login(context);await page.goto(f.origin+prefix+'/admin');
   await page.getByRole('link',{name:t.Admin.shell.searchWorkspace,exact:true}).click();await expect(page).toHaveURL(new RegExp(prefix+'/admin/search$'));
   const box=page.getByRole('searchbox',{name:t.WorkspaceSearch.query,exact:true});await box.fill(f.label);await box.press('Enter');await expect(page).toHaveURL(url=>url.pathname===prefix+'/admin/search'&&url.searchParams.get('q')===f.label);
   for(const kind of ['member','company','application','event','conversation'] as const)await expect(page.getByRole('heading',{name:t.WorkspaceSearch.kinds[kind],exact:true})).toBeVisible();
   const results=page.locator('main section[aria-labelledby^="workspace-"] a');expect(await results.count()).toBe(5);
   const member=page.locator('#workspace-member').locator('..').getByRole('link',{name:f.label,exact:true});await member.focus();await member.press('Enter');await expect(page).toHaveURL(new RegExp('/admin/members/'+f.profileId+'$'));
   await page.goBack();await expect(box).toHaveValue(f.label);await expect(page.getByRole('heading',{name:t.WorkspaceSearch.kinds.conversation,exact:true})).toBeVisible();
   const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);
   await page.screenshot({path:root+locale+'-search-desktop.png',fullPage:false});checks.push({locale,case:'classified keyboard search/back',entities:5,seriousOrCriticalAxe:0});
  });
  for(const count of [51,101])test(locale+' '+count+' stable pagination and browser history',async({page,context})=>{
   await login(context);const entry=f.queries.find(q=>q.count===count)!;await page.goto(f.origin+prefix+'/admin/search?'+new URLSearchParams({q:entry.query}));
   const ids:string[]=[];let pages=0,first:string[]=[];
   do{const links=page.locator('main section[aria-labelledby^="workspace-"] a');await expect(links.first()).toBeVisible();const current=await links.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')!));expect(current.length).toBeLessThanOrEqual(20);if(!pages)first=current;ids.push(...current);pages++;
    const next=page.getByRole('link',{name:t.WorkspaceSearch.next,exact:true});if(!await next.count())break;const old=page.url();await next.click();await expect(page).not.toHaveURL(old);await expect(links.first()).not.toHaveAttribute('href',current[0]);
   }while(pages<7);
   expect(ids).toHaveLength(count);expect(new Set(ids).size).toBe(count);await page.getByRole('link',{name:t.WorkspaceSearch.first,exact:true}).click();await expect(page).not.toHaveURL(/cursor=/);await expect(page.locator('main section[aria-labelledby^="workspace-"] a').first()).toHaveAttribute('href',first[0]);expect(await page.locator('main section[aria-labelledby^="workspace-"] a').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('href')!))).toEqual(first);
   await page.goBack();await expect(page).toHaveURL(/cursor=/);await page.goForward();await expect(page).not.toHaveURL(/cursor=/);checks.push({locale,case:'stable search keyset',records:count,pages,noDuplicateOrMissing:true,historyPreserved:true});
  });
  test(locale+' empty/invalid recovery, mobile and closed history',async({page,context})=>{
   await login(context);await page.setViewportSize({width:390,height:844});await page.goto(f.origin+prefix+'/admin/search');await expect(page.getByText(t.WorkspaceSearch.idle,{exact:true})).toBeVisible();
   await page.getByRole('searchbox',{name:t.WorkspaceSearch.query,exact:true}).fill('unmatched-'+f.sourceSha);await page.getByRole('button',{name:t.WorkspaceSearch.submit,exact:true}).click();await expect(page.getByText(t.WorkspaceSearch.empty,{exact:true})).toBeVisible();
   await page.goto(f.origin+prefix+'/admin/search?'+new URLSearchParams({q:f.label,cursor:'invalid-cursor'}));await expect(page.getByText(t.WorkspaceSearch.invalid,{exact:true})).toBeVisible();
   await page.goto(f.origin+prefix+'/admin/search?'+new URLSearchParams({q:f.label}));await expect(page.getByRole('heading',{name:t.WorkspaceSearch.kinds.member,exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
   const box=await page.getByRole('button',{name:t.WorkspaceSearch.submit,exact:true}).boundingBox();expect(box?.height).toBeGreaterThanOrEqual(44);const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>v.impact==='serious'||v.impact==='critical')).toEqual([]);await page.screenshot({path:root+locale+'-search-mobile.png',fullPage:false});
   await page.goto(f.origin+prefix+'/admin/batches');await expect(page.locator('main h1')).toBeVisible();await page.goto(f.origin+prefix+'/admin/automations#verified-worker-health');await expect(page.locator('#verified-worker-health')).toBeVisible();checks.push({locale,case:'recovery/mobile/readable closed history',mobileWidth:390,targetMinHeight:44,seriousOrCriticalAxe:0,cloudWorkerWindowsVerified:false});
  });
 }
 test('member and anonymous cannot use privileged workspace search',async({page,context})=>{
  await page.goto(f.origin+'/admin/search?q='+encodeURIComponent(f.label));await expect(page).toHaveURL(/admin-login/);await login(context,'MEMBER');await page.goto(f.origin+'/admin/search?q='+encodeURIComponent(f.label));await expect(page).toHaveURL(/admin-login/);expect(await page.locator('main section[aria-labelledby^="workspace-"]').count()).toBe(0);checks.push({case:'member/anonymous denied',workspaceResultsVisible:false});
 });
});
