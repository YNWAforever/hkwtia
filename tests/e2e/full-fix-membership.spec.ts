import {test,expect,type BrowserContext} from "@playwright/test";
import {Pool} from "pg";
import {randomUUID,randomBytes,createHash} from "node:crypto";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from "../../scripts/lib/acceptance-guard";
const en:typeof import("../../messages/en.json")=JSON.parse(readFileSync("messages/en.json","utf8"));
const zh:typeof import("../../messages/zh-HK.json")=JSON.parse(readFileSync("messages/zh-HK.json","utf8"));
const origin="https://hkwtia-membership-lifecycle-20261003.vercel.app",sourceSha=process.env.FULL_FIX_EXPECTED_SOURCE_SHA??"";
const root="docs/audits/hkwtia-2026-10-03-full-fix/evidence/t14b/";
let pool:Pool,profileId:string,before:unknown;
const checks:object[]=[],applicationIds:string[]=[],bindings:{profileId:string;authId:string}[]=[];
const digest=(id:string)=>createHash("sha256").update(id).digest("hex").slice(0,16);
async function login(context:BrowserContext) {
 // Each journey owns a fresh actual Auth subject and a member-only profile fixture.
 // This does not claim verified-email provisioning or Google/magic-link acceptance.
 const run=randomUUID(),email="t14b-"+run+"@membership.example.test",password=randomBytes(24).toString("base64url")+"X!9";
 const response=await context.request.post(origin+"/api/auth/sign-up/email",{headers:{Origin:origin,Referer:origin+"/member-login"},data:{email,password,name:"Synthetic T14B"}});expect(response.status()).toBe(200);
 const identity=await response.json(),id=identity.user?.id??identity.data?.user?.id;expect(typeof id).toBe("string");
 const ownProfile="t14b-browser-"+run;
 await pool.query("INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale,whatsapp_opt_in) VALUES($1,$2,$3,'Synthetic T14B Member','member','zh-HK',false)",[ownProfile,id,email]);
 const rows=(await pool.query("SELECT id,role FROM profiles WHERE auth_user_id=$1",[id])).rows;expect(rows).toEqual([{id:ownProfile,role:"member"}]);bindings.push({profileId:ownProfile,authId:id});profileId=ownProfile;return ownProfile;
}
async function draft(plan:"community"|"patron"|"corporate") {
 const id=randomUUID();await pool.query("INSERT INTO membership_applications(id,applicant_user_id,plan_code,status,current_step) VALUES($1,$2,$3,'draft','profile')",[id,profileId,plan]);applicationIds.push(id);return id;
}
const membership=async(applicationId:string)=>(await pool.query("SELECT id,status,plan_code,stripe_customer_id,stripe_subscription_id FROM memberships WHERE application_id=$1",[applicationId])).rows;
test.use({trace:"off",video:"off",actionTimeout:30000});
test.describe("actual isolated manual membership journeys",()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=="1","Confirmed isolated Preview DB/Auth required; not provider acceptance");
 test.beforeAll(async({browser,baseURL})=>{
  expect(baseURL).toBe(origin);expect(sourceSha).toMatch(/^[a-f0-9]{40}$/);const url=assertIsolatedSeedEnvironment(process.env,{prefix:"FULL_REMEDIATION",flag:"FULL_REMEDIATION_ACCEPTANCE_SEED",hostAllowlistVar:"FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});expect(new URL(url).hostname).toBe("ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");
  const d=JSON.parse(readFileSync(".playwright/full-fix-t14b-preview-deployment-safe.json","utf8")),r=JSON.parse(readFileSync(".playwright/full-fix-t14b-preview-runtime-safe.json","utf8"));expect(d.sourceSha).toBe(sourceSha);expect(d.target).toBeNull();expect(r.checks.some((c:{dbSourcePositivelyProven?:boolean})=>c.dbSourcePositivelyProven)).toBe(true);
  pool=new Pool({connectionString:url,query_timeout:15000});await assertSeedSentinel("FULL_REMEDIATION",async()=>Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n));
  void browser;
  expect((await pool.query("SELECT count(*)::int AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'")).rows).toEqual([{n:0}]);
  before=(await pool.query("SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM billing_attempts) AS billing,(SELECT count(*) FROM ai_budget_reservations) AS budgets")).rows;mkdirSync(root,{recursive:true});
 });
 test.afterAll(async({browser},info)=>{void browser;if(!pool)return;try{
  for(const binding of bindings)expect((await pool.query("SELECT auth_user_id,role,whatsapp_opt_in FROM profiles WHERE id=$1",[binding.profileId])).rows).toEqual([{auth_user_id:binding.authId,role:"member",whatsapp_opt_in:false}]);
  expect((await pool.query("SELECT (SELECT count(*) FROM messages) AS messages,(SELECT count(*) FROM billing_attempts) AS billing,(SELECT count(*) FROM ai_budget_reservations) AS budgets")).rows).toEqual(before);
  writeFileSync(root+"native-"+sourceSha.slice(0,8)+"-worker-"+info.workerIndex+".json",JSON.stringify({observedAt:new Date().toISOString(),sourceSha,origin,checks,applicationRefs:applicationIds.map(digest),actualPasswordAuth:true,syntheticMemberProfileFixtures:true,actualFreshPasswordSignups:bindings.length,newVerifiedIdentityProvisioning:false,googleVerified:false,magicLinkVerified:false,associationPolicyApproval:false,policyFlag:false,messagesBillingBudgetDelta:0,providerRequests:0,production:false,cleanup:"Owned synthetic applications/history retained; no production fixtures or history removed"},null,2));
 }finally{await pool.end();}});
 for(const locale of ["en","zh-HK"] as const){const t=locale==="en"?en:zh,prefix=locale==="en"?"":"/zh";
  test(locale+" community interruption and completion use authoritative membership status",async({page,context})=>{
   await login(context);const app=await draft("community"),path=prefix+"/join/profile?"+new URLSearchParams({plan:"community",application:app});
   await page.goto(origin+path);await expect(page.getByRole("heading",{name:t.Join.profileTitle,exact:true})).toBeVisible();
   const savedName=await page.getByLabel(t.Join.fields.displayName,{exact:true}).inputValue();expect(savedName.length).toBeGreaterThan(0);expect(await membership(app)).toEqual([]);
   await page.goto(origin+prefix+"/membership");await page.goto(origin+path);await expect(page.getByLabel(t.Join.fields.displayName,{exact:true})).toHaveValue(savedName);
   await page.getByRole("button",{name:t.Join.continue,exact:true}).click();await expect(page).toHaveURL(/\/join\/complete\?membership_id=/);await expect(page.locator('[data-checkout-status="active"]')).toBeVisible();
   const rows=await membership(app);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({status:"active",plan_code:"community",stripe_customer_id:null,stripe_subscription_id:null});
   await page.goto(origin+prefix+"/join?"+new URLSearchParams({plan:"community",application:app}));await expect(page.getByRole("heading",{name:t.Join.status.complete.title,exact:true})).toBeVisible();expect(await membership(app)).toEqual(rows);
   if(locale==="zh-HK")await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);const axe=await new AxeBuilder({page}).analyze();expect(axe.violations.filter(v=>v.impact==="serious"||v.impact==="critical")).toEqual([]);await page.screenshot({path:root+locale+"-community-complete.png"});checks.push({locale,case:"community interrupt/resume/submit/authoritative return",applicationRef:digest(app),memberships:1,status:"active",seriousOrCriticalAxe:0});
  });
 }
 test("review-tier remains pending without a payment or approval shortcut",async({page,context})=>{
  await login(context);const app=await draft("patron");await page.goto(origin+"/zh/join/profile?"+new URLSearchParams({plan:"patron",application:app}));await page.getByRole("button",{name:zh.Join.continue,exact:true}).click();await expect(page).toHaveURL(/\/join\/complete\?membership_id=/);await expect(page.locator('[data-checkout-status="review"]')).toBeVisible();const rows=await membership(app);expect(rows).toHaveLength(1);expect(rows[0].status).toBe("pending_review");await page.screenshot({path:root+"zh-HK-patron-review.png"});checks.push({case:"patron approval boundary",status:"pending_review",paymentRequests:0});
 });
 test("company submission can resume without unpaid entitlement or a second application",async({page,context})=>{
  await login(context);const app=await draft("corporate");await page.goto(origin+"/zh/join/profile?"+new URLSearchParams({plan:"corporate",application:app}));await page.getByRole("button",{name:zh.Join.continue,exact:true}).click();await expect(page).toHaveURL(/\/join\/company\?/);
  await page.getByLabel(zh.Join.fields.legalName,{exact:true}).fill("Synthetic T14B "+digest(app)+" Limited");await page.getByLabel(zh.Join.fields.companyDisplayName,{exact:true}).fill("Synthetic T14B "+digest(app));
  await page.getByRole("button",{name:zh.Join.submitApplication,exact:true}).click();await expect(page).toHaveURL(/\/join\/checkout\?membership_id=/);await expect(page.getByRole("heading",{name:zh.Join.checkoutSummary.title,exact:true})).toBeVisible();
  const rows=await membership(app);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({status:"pending_payment",stripe_customer_id:null,stripe_subscription_id:null});
  await page.goto(origin+"/zh/join/complete?"+new URLSearchParams({membership_id:rows[0].id,session_id:"forged-success"}));await expect(page.locator('[data-checkout-status="processing"]')).toBeVisible();await expect(page.locator('[data-checkout-status="active"]')).toHaveCount(0);expect(await membership(app)).toEqual(rows);await page.screenshot({path:root+"zh-HK-company-awaiting-payment.png"});checks.push({case:"company submit and forged success rejected",applicationRef:digest(app),status:"pending_payment",checkoutAttempts:0});
 });
});
