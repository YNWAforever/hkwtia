import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {randomUUID,createHash} from "node:crypto";
import {test,expect} from "@playwright/test";
import {Pool} from "pg";
import {assertIsolatedSeedEnvironment,assertSeedSentinel} from "../../scripts/lib/acceptance-guard";
import {signInForM2} from "../fixtures/m2-auth";
const en:typeof import("../../messages/en.json")=JSON.parse(readFileSync("messages/en.json","utf8"));
const zh:typeof import("../../messages/zh-HK.json")=JSON.parse(readFileSync("messages/zh-HK.json","utf8"));
const origin="http://localhost:3450",sourceSha=process.env.FULL_FIX_EXPECTED_SOURCE_SHA??"",root="docs/audits/hkwtia-2026-10-03-full-fix/evidence/t14c/";
const run=randomUUID(),checks:object[]=[],owned:string[]=[];
const digest=(id:string)=>createHash("sha256").update(id).digest("hex").slice(0,16);
let pool:Pool;
const modes=[{slug:"external-online",registrationMode:"external",format:"online"},{slug:"external-hybrid",registrationMode:"external",format:"hybrid"},{slug:"rsvp-in-person",registrationMode:"rsvp",format:"in_person"},{slug:"ticketed-in-person",registrationMode:"ticketed",format:"in_person"}] as const;
test.use({trace:"off",video:"off",actionTimeout:30000});
test.describe("T14C actual isolated event workspace and public journeys",()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=="1","Confirmed isolated local DB/Auth and built runtime proof required");
 test.beforeAll(async({baseURL})=>{
  expect(baseURL).toBe(origin);expect(sourceSha).toMatch(/^[a-f0-9]{40}$/);
  const url=assertIsolatedSeedEnvironment(process.env,{prefix:"FULL_REMEDIATION",flag:"FULL_REMEDIATION_ACCEPTANCE_SEED",hostAllowlistVar:"FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST"});expect(new URL(url).hostname).toBe("ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");expect(new URL(process.env.NEON_AUTH_BASE_URL!).hostname).toBe("ep-plain-mouse-azm8pl2j.neonauth.c-3.ap-southeast-1.aws.neon.tech");
  const proof=JSON.parse(readFileSync(".playwright/full-fix-t14c-local-runtime-safe.json","utf8"));expect(proof).toMatchObject({origin,sourceSha,ledger:59,dbSourcePositivelyProven:true,production:false});
  pool=new Pool({connectionString:url,query_timeout:15000});await assertSeedSentinel("FULL_REMEDIATION",async()=>Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n));expect((await pool.query("SELECT count(*)::int AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'")).rows).toEqual([{n:0}]);mkdirSync(root,{recursive:true});
 });
 test.beforeEach(async({context})=>{
  // Loopback fixture models the overwritten ingress IP only on our owned server.
  // Authorization and the actual shared limiter remain enabled; never forward this to Stripe.
  await context.route(origin+"/**",route=>route.continue({headers:{...route.request().headers(),"x-real-ip":`198.18.${parseInt(run.slice(0,2),16)}.${parseInt(run.slice(2,4),16)}`}}));
 });
 test.afterAll(async({browser},info)=>{void browser;if(!pool)return;try{writeFileSync(root+"native-"+sourceSha.slice(0,8)+"-worker-"+info.workerIndex+"-"+run.slice(0,8)+".json",JSON.stringify({observedAt:new Date().toISOString(),sourceSha,origin,run,checks,ownedEventRefs:owned.map(digest),actualPasswordAuth:true,syntheticFixture:true,emailMode:"test sink only",stripeAcceptance:"separate actual provider receipt",production:false,cleanup:"Owned synthetic events/registrations/audits retained; unrelated data preserved"},null,2));}finally{await pool.end();}});
 for(const locale of ["en","zh-HK"] as const){const t=locale==="en"?en:zh,prefix=locale==="en"?"":"/zh";
  test(locale+" staff creates/previews/edits four event modes and preserves Hong Kong dates",async({page})=>{
   await signInForM2(page,"staff");
   for(const [index,mode] of modes.entries()){
    const slug="t14c-native-"+run+"-"+locale.toLowerCase()+"-"+mode.slug,titleEn="Synthetic T14C "+mode.slug,titleZh="合成 T14C "+mode.slug;
    await page.goto(origin+prefix+"/admin/events-mgmt");const form=page.locator("form:has(input[name=slug])").first();
    await form.locator("input[name=slug]").fill(slug);await form.locator("input[name=titleEn]").fill(titleEn);await form.locator("input[name=titleZh]").fill(titleZh);await form.locator("textarea[name=descriptionEn]").fill("Synthetic event acceptance");await form.locator("textarea[name=descriptionZh]").fill("合成活動驗收");
    await form.locator("input[name=startsAt]").fill(`2031-02-0${index+1}T10:00`);await form.locator("input[name=endsAt]").fill(`2031-02-0${index+1}T12:00`);await form.locator("select[name=format]").selectOption(mode.format);
    if(mode.format!=="online")await form.locator("input[name=venue]").fill("Synthetic Hong Kong Venue");if(mode.format!=="in_person")await form.locator("input[name=onlineUrl]").fill("https://meet.example.test/"+slug);
    await form.locator("select[name=registrationMode]").selectOption(mode.registrationMode);if(mode.registrationMode==="external")await form.locator("input[name=externalRegistrationUrl]").fill("https://register.example.test/"+slug);if(mode.registrationMode==="ticketed")await form.locator("input[name=ticketPriceHkdCents]").fill("10");
    await form.locator("input[name=capacity]").fill("2");await form.locator("input[name=tags]").fill("AI, Machine Learning");await form.locator("select[name=visibility]").selectOption("public");await form.locator("input[name=published]").check();
    await form.getByRole("button",{name:t.Admin.eventsMgmt.previewDraft,exact:true}).click();await expect(page.locator("section[aria-labelledby=event-draft-preview-title]")).toContainText(titleEn);await expect(page.locator("section[aria-labelledby=event-draft-preview-title]")).toContainText(titleZh);expect((await pool.query("SELECT id FROM events WHERE slug=$1",[slug])).rows).toEqual([]);
    await form.locator('button[type="submit"]').focus();await page.keyboard.press("Enter");await expect(form.getByRole("status").filter({hasText:t.Admin.eventsMgmt.createSuccess})).toHaveText(t.Admin.eventsMgmt.createSuccess);
    const row=(await pool.query("SELECT id,starts_at,ticket_price_hkd_cents FROM events WHERE slug=$1",[slug])).rows[0];expect(row.starts_at.toISOString()).toBe(`2031-02-0${index+1}T02:00:00.000Z`);if(mode.registrationMode==="ticketed")expect(row.ticket_price_hkd_cents).toBe(1000);owned.push(row.id);
    await page.goto(origin+prefix+"/admin/events-mgmt/"+row.id);const edit=page.locator("form:has(input[name=slug])").first();await expect(edit.locator("select[name=registrationMode]")).toHaveValue(mode.registrationMode);await expect(edit.locator("select[name=format]")).toHaveValue(mode.format);await expect(edit.locator("input[name=tags]")).toHaveValue("ai, machine-learning");await expect(edit.locator("input[name=startsAt]")).toHaveValue(`2031-02-0${index+1}T10:00`);
    await edit.locator("textarea[name=descriptionEn]").fill("Synthetic edited description");await edit.locator('button[type="submit"]').click();await expect(edit.getByRole("status").filter({hasText:t.Admin.eventsMgmt.updateSuccess})).toHaveText(t.Admin.eventsMgmt.updateSuccess);
    await page.goto(origin+prefix+"/events/"+slug);await expect(page.getByRole("heading",{level:1,name:locale==="en"?titleEn:titleZh,exact:true})).toBeVisible();if(mode.registrationMode==="external"){await expect(page.locator('a[href="https://register.example.test/'+slug+'"]')).toBeVisible();expect((await pool.query("SELECT count(*)::int AS n FROM event_orders WHERE event_id=$1",[row.id])).rows[0].n).toBe(0);}
    if(locale==="zh-HK")await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);if(index===3)await page.screenshot({path:root+locale+"-ticketed-event.png"});checks.push({locale,case:"event editor/private draft preview/keyboard publish/edit/public",mode:mode.registrationMode,format:mode.format,eventRef:digest(row.id),hongKongDatePreserved:true});
   }
  });
 }
 test("anonymous RSVP reserves once, waits at shared capacity and keeps marketing consent off",async({page})=>{
  const id=randomUUID(),slug="t14c-native-"+run+"-guest";owned.push(id);await pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at,published,status,registration_mode,capacity,visibility) VALUES($1,$2,'Synthetic T14C RSVP','合成 T14C 報名','Synthetic only','2031-12-31',true,'published','rsvp',1,'public')",[id,slug]);
  const submit=async(email:string,expected:string)=>{await page.goto(origin+"/zh/events/"+slug);const f=page.locator("form.guest-rsvp-form");await f.locator('input[name="name"]').fill("Synthetic Guest");await f.locator('input[name="email"]').fill(email);await expect(f.locator('input[name="marketingConsent"]')).not.toBeChecked();await f.locator('button[type="submit"]').click();await expect(f.locator("#guest-rsvp-status")).toHaveText(expected);return f;};
  await submit("t14c-first-"+run+"@example.test",zh.Events.guest.registered);expect((await pool.query("SELECT status,marketing_consent_at FROM event_guest_registrations WHERE event_id=$1",[id])).rows).toEqual([{status:"registered",marketing_consent_at:null}]);await submit("t14c-first-"+run+"@example.test",zh.Events.guest.already);expect((await pool.query("SELECT count(*)::int AS n FROM event_guest_registrations WHERE event_id=$1",[id])).rows[0].n).toBe(1);await submit("t14c-second-"+run+"@example.test",zh.Events.guest.waitlist);expect((await pool.query("SELECT status FROM event_guest_registrations WHERE event_id=$1 ORDER BY created_at",[id])).rows).toEqual([{status:"registered"},{status:"waitlist"}]);expect((await pool.query("SELECT count(*)::int AS n FROM event_orders WHERE event_id=$1",[id])).rows[0].n).toBe(0);await page.screenshot({path:root+"zh-HK-rsvp-waitlist.png"});checks.push({case:"actual guest RSVP replay/waitlist/consent",eventRef:digest(id),registered:1,waitlist:1,orders:0,marketingConsent:false,emailDelivery:"test sink"});
 });
 test("private and cancelled/ended events do not expose a usable checkout",async({page})=>{
  for(const mode of ["private","cancelled","ended"]){const id=randomUUID(),slug="t14c-native-"+run+"-"+mode;owned.push(id);await pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at,ends_at,published,status,registration_mode,ticket_price_hkd_cents,capacity,visibility) VALUES($1,$2,'Synthetic T14C Restricted','合成受限活動','Synthetic only',$3,$3,$4,$5,'ticketed',1000,1,'public')",[id,slug,mode==="ended"?"2020-01-01":"2031-12-31",mode==="ended",mode==="private"?"draft":mode==="cancelled"?"cancelled":"published"]);const response=await page.goto(origin+"/zh/events/"+slug);expect(response!.status()).toBe(mode==="private"?404:200);await expect(page.locator('input[name="buyerEmail"]')).toHaveCount(0);expect((await pool.query("SELECT count(*)::int AS n FROM event_orders WHERE event_id=$1",[id])).rows[0].n).toBe(0);checks.push({case:"restricted event UI",mode,status:response!.status(),orders:0});}
 });
});
