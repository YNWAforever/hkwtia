import {randomUUID} from "node:crypto";
import {readFileSync,mkdirSync,writeFileSync} from "node:fs";
import {Pool} from "pg";
import {expect,test} from "@playwright/test";
import {signInForM2} from "../fixtures/m2-auth";
import {AUDIT_DEMO_EVENT_SLUGS} from "../../config/demo-events";
const root="docs/audits/hkwtia-2026-10-01-remediation/evidence/t20",run=randomUUID(),publicId=randomUUID(),privateId=randomUUID(),demoId=randomUUID(),publicSlug="synthetic-public-"+run,privateSlug="synthetic-private-"+run;
let pool:Pool,ownDemo=false,demoBaseline:Record<string,unknown>;
test.use({trace:"off",video:"off",actionTimeout:30000});
test.describe("confirmed isolated public content",()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=="true","Confirmed isolated DB/Auth acceptance required");
 test.beforeAll(async({baseURL})=>{
  expect(new URL(baseURL!).hostname).toBe("localhost");expect(process.env.DATABASE_URL).toBe(process.env.DATABASE_URL_TEST);
  expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe("ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech");expect(process.env.NEON_PROJECT_ID).toBe("solitary-wave-52860119");
  pool=new Pool({connectionString:process.env.DATABASE_URL_TEST});expect(Number((await pool.query("SELECT count(*) AS n FROM acceptance_sentinel")).rows[0].n)).toBe(1);
  await pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,description_zh,starts_at,published,status,visibility,capacity) VALUES($1,$2,'Synthetic public content event','合成公開內容活動','Synthetic read-only journey','合成只讀流程',now()+interval '1 day',true,'published','public',10),($3,$4,'Synthetic private content event','合成私人內容活動','Synthetic','合成',now()+interval '1 day',true,'published','members_only',10)",[publicId,publicSlug,privateId,privateSlug]);
  const inserted=await pool.query("INSERT INTO events(id,slug,title_en,title_zh,description_en,starts_at,published,status,visibility) VALUES($1,$2,'Synthetic marked demo','合成示範活動','Synthetic marked demo',now()+interval '1 day',true,'published','public') ON CONFLICT(slug) DO NOTHING RETURNING id",[demoId,AUDIT_DEMO_EVENT_SLUGS[0]]);ownDemo=inserted.rowCount===1;
  demoBaseline=(await pool.query("SELECT published,status,visibility FROM events WHERE slug=$1",[AUDIT_DEMO_EVENT_SLUGS[0]])).rows[0];mkdirSync(root,{recursive:true});
 });
 test.afterAll(async()=>{if(!pool)return;await pool.query("DELETE FROM events WHERE id=ANY($1::uuid[])",[[publicId,privateId,...(ownDemo?[demoId]:[])]]);await pool.end();});
 for(const locale of ["en","zh"] as const){
  const prefix=locale==="zh"?"/zh":"",bundle=JSON.parse(readFileSync("messages/"+(locale==="zh"?"zh-HK":"en")+".json","utf8")) as typeof import("../../messages/en.json");
  test(`${locale} public login, partner assets and publication scope`,async({page})=>{
   test.setTimeout(180000);const facts:Record<string,unknown>={sourceSha:process.env.AUDIT_SOURCE_SHA??"uncommitted",environment:"confirmed isolated Neon/Auth; owned built loopback",production:false,providerWrites:0,locale};
   await page.goto(prefix||"/");const member=page.getByRole("banner").locator('a[href="'+prefix+'/member-login"]');await expect(member).toHaveCount(1);await expect(member).toBeVisible();await member.focus();await member.press("Enter");await expect(page).toHaveURL(new RegExp(prefix+"/member-login$"));await expect(page.getByTestId("member-login-form")).toBeVisible();
   await page.setViewportSize({width:390,height:900});await page.goto(prefix||"/");await page.waitForLoadState("networkidle");const trigger=page.getByRole("button",{name:bundle.Navigation.openMenu,exact:true});await trigger.focus();await trigger.press("Enter");const dialog=page.getByRole("dialog");await expect(dialog.locator('a[href="'+prefix+'/member-login"]')).toBeVisible();await page.keyboard.press("Escape");await expect(trigger).toBeFocused();
   const footer=page.getByRole("contentinfo").locator('a[href="'+prefix+'/admin-login"]');await footer.scrollIntoViewIfNeeded();await footer.focus();await footer.press("Enter");await expect(page).toHaveURL(new RegExp(prefix+"/admin-login$"));await expect(page.getByTestId("admin-login-form")).toBeVisible();
   await page.goto(prefix||"/");const wall=page.locator('.legacy-network');await wall.scrollIntoViewIfNeeded();
   for(const [category,count] of [["supporting",58],["regional",15],["media",6]] as const){const tab=wall.getByRole("button").filter({hasText:bundle.Home.legacyNetwork.tabs[category]});await tab.click();await expect(tab.locator('b')).toHaveText(String(count).padStart(2,"0"));await expect(wall.locator('.legacy-logo-card')).toHaveCount(Math.min(12,count));}
   await page.goto(prefix+'/partners');await expect(page.locator('#partners-source-title')).toHaveText(locale==="zh"?"認識合作夥伴":"Meet our partners");await expect(page.locator('.partner-record-card')).toHaveCount(79);
   for(const [category,count] of [["supporting",58],["regional",15],["media",6]] as const)await expect(page.locator('#partners-'+category+' .partner-record-card')).toHaveCount(count);
   const images=page.locator('.partner-record-card img');await expect(images).toHaveCount(79);
   for(const image of await images.all()){await expect(image).toHaveAttribute('loading','lazy');await image.scrollIntoViewIfNeeded();await expect.poll(()=>image.evaluate(el=>(el as HTMLImageElement).complete&&(el as HTMLImageElement).naturalWidth>0),{timeout:20000}).toBe(true);}
   expect(await page.locator('.partner-record-card a').evaluateAll(links=>links.every(el=>{const url=new URL((el as HTMLAnchorElement).href);return url.protocol==='https:'&&!url.username&&!url.password;}))).toBe(true);
   await page.locator('#partners-source-title').scrollIntoViewIfNeeded();
   for(const width of [1440,390]){await page.setViewportSize({width,height:950});expect(await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(0);await page.screenshot({path:root+'/'+locale+'-partners-'+width+'.png'});}
   for(const route of ['','/membership','/partners']){await page.goto(prefix+(route||'/'));expect(await page.locator('main').innerText()).not.toMatch(/VERIFIED WTIA ARCHIVE|scraped logo wall|抓取而來的標誌牆|price_[a-z0-9]+/i);}
   await page.goto(prefix+'/events');await expect(page.locator('main a[href="'+prefix+'/events/'+publicSlug+'"]').first()).toBeVisible();await expect(page.locator('main a[href="'+prefix+'/events/'+privateSlug+'"]')).toHaveCount(0);await expect(page.locator('main a[href="'+prefix+'/events/'+AUDIT_DEMO_EVENT_SLUGS[0]+'"]')).toHaveCount(0);
   Object.assign(facts,{memberHeaderKeyboard:true,mobileMemberLink:true,footerStaffKeyboard:true,partners:79,categories:{supporting:58,regional:15,media:6},actualLoadedLazyImages:79,partnerWebsiteUrls:'all rendered destinations structurally HTTPS; external destination HTTP not tested',publicEventVisible:true,membersOnlyExcluded:true,demoExcluded:true,demoBaseline,policySignoff:'D01-D06 pending; current policy/pricing preserved'});writeFileSync(root+'/'+locale+'-browser.json',JSON.stringify(facts,null,2)+'\n');
  });
  test(`${locale} existing signed-in staff returns to admin`,async({page})=>{await signInForM2(page,'staff');await page.goto(prefix+'/admin-login');await expect(page).toHaveURL(new RegExp(prefix+'/admin$'));await expect(page.getByRole('heading',{level:1})).toBeVisible();});
 }
});
