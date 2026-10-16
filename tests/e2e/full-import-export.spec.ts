import {readFileSync,writeFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {expect,test} from "@playwright/test";
import {missingM2IdentityEnvironment,signInForM2} from "../fixtures/m2-auth";
const en=JSON.parse(readFileSync(new URL("../../messages/en.json",import.meta.url),"utf8")) as typeof import("../../messages/en.json");
const zh=JSON.parse(readFileSync(new URL("../../messages/zh-HK.json",import.meta.url),"utf8")) as typeof import("../../messages/zh-HK.json");
const runProcess=promisify(execFile);
async function driver(mode:string,run:string,batchId?:string){const {stdout}=await runProcess(process.execPath,['--conditions=react-server','--import','tsx','tests/fixtures/audit-batch-driver.ts',mode,run,...(batchId?[batchId]:[])],{timeout:120000});return JSON.parse(stdout) as {ids:string[];prepared:boolean;claimed:number;contactCount:number;contactOnly:boolean;changes:number;roles:number;memberships:number;locale:string};}
test.afterEach(async ({page},info)=>{try{writeFileSync(`.playwright/t22-import-after-${info.title.startsWith("zh-HK")?"zh":"en"}-safe.json`,JSON.stringify({pathname:new URL(page.url()).pathname,lang:await page.locator("html").getAttribute("lang"),fileInputs:await page.locator('input[type="file"]').count(),enLabel:await page.getByLabel(en.Admin.imports.chooseFile,{exact:true}).count(),zhLabel:await page.getByLabel(zh.Admin.imports.chooseFile,{exact:true}).count()}));}catch{/* Test's original assertion remains the result. */}});
for(const [locale,prefix,messages] of [['en','',en],['zh-HK','/zh',zh]] as const){
 test(`${locale}: row decisions, private correction report and exact import commit`,async({page,baseURL,browser})=>{
  test.skip(missingM2IdentityEnvironment().length>0||process.env.AUDIT_ISOLATED_ACCEPTANCE!=='true'||process.env.AUDIT_BATCH_WORKER_PAUSED!=='true','Requires confirmed isolated DB/Auth and paused batch worker');
  expect(new URL(baseURL!).hostname).not.toBe('hkwtia.vercel.app');
  const run=randomUUID(),fixture=await driver('seed',run),labels=messages.Admin.imports,batch=messages.Admin.batches;
  const email=`audit-import-${run}@example.test`,existing=(id:string)=>id+'@example.test';
  const csv=`\uFEFFMember ID,Email,Name,Locale,Plan\r\n${fixture.ids[0]},${existing(fixture.ids[0]!)},,zh-HK,corporate\r\n,${email},"陳, Synthetic\nNew",en,patron\r\n,${email.toUpperCase()},Duplicate,en,\r\n,${existing(fixture.ids[1]!)},Existing,en,\r\n,invalid,Invalid,en,\r\n`;
  await signInForM2(page,'staff');await page.goto(`${prefix}/admin/members/import`);
   writeFileSync(`.playwright/t22-import-route-${locale}-safe.json`,JSON.stringify({pathname:new URL(page.url()).pathname,lang:await page.locator("html").getAttribute("lang"),files:await page.locator('input[type="file"]').count(),matchingLabels:await page.getByLabel(labels.chooseFile,{exact:true}).count()}));
  await expect(page.getByLabel(labels.chooseFile,{exact:true})).toBeVisible();
   await page.getByLabel(labels.chooseFile,{exact:true}).setInputFiles({name:'synthetic-import.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await page.getByRole('button',{name:labels.upload,exact:true}).click();
  for(const [field,column]of [['profileId','Member ID'],['email','Email'],['displayName','Name'],['locale','Locale'],['planCode','Plan']] as const)await page.getByRole('combobox',{name:labels.fields[field],exact:true}).selectOption(column);
  await page.getByRole('button',{name:labels.validate,exact:true}).click();
  await expect(page.getByRole('button',{name:labels.preview,exact:true})).toBeVisible();
  for(const [key,n]of [['total',5],['create',1],['update',1],['duplicate',1],['conflict',1],['invalid',1]] as const)await expect(page.locator('dl > div').filter({has:page.locator('dt',{hasText:new RegExp(`^${labels[key]}$`)})}).locator('dd')).toHaveText(String(n));
  await page.getByRole('button',{name:labels.preview,exact:true}).click();await expect(page.locator('tbody tr')).toHaveCount(5);
  await expect(page.getByRole('checkbox',{name:`${labels.row} 4`,exact:true})).toBeDisabled();
  const link=page.getByRole('link',{name:labels.downloadErrors,exact:true}),href=await link.getAttribute('href');expect(href).toBeTruthy();
  const response=await page.request.get(href!);expect(response.status()).toBe(200);expect(response.headers()['cache-control']).toBe('private, no-store');expect(response.headers()['content-disposition']).toContain('attachment;');
  const report=await response.text();expect(report.charCodeAt(0)).toBe(0xfeff);expect(report).not.toContain('@example.test');expect(report).toContain(labels.reasons.EMAIL_INVALID);expect(report).toContain(labels.reasons.DUPLICATE_EMAIL);
  const downloaded=page.waitForEvent('download');await link.click();const file=await downloaded;expect(file.suggestedFilename()).toMatch(/^import-issues-[a-f0-9-]+\.csv$/);await file.saveAs(`.playwright/t15-issues-${locale}.csv`);await expect(page.locator('tbody tr'),'review remains after CSV download').toHaveCount(5);
  const anonymous=await browser.newContext();expect((await anonymous.request.get(new URL(href!,baseURL!).href)).status()).toBe(404);await anonymous.close();await expect(page.locator('tbody tr'),'review remains after anonymous denial').toHaveCount(5);
  for(const role of ['member','superadmin'] as const){const context=await browser.newContext({baseURL});const separate=await context.newPage();await signInForM2(separate,role);expect((await context.request.get(new URL(href!,baseURL!).href)).status()).toBe(404);await context.close();await expect(page.locator('tbody tr'),`review remains after ${role} denial`).toHaveCount(5);}
  expect((await page.request.get(href!+'&actor=superadmin')).status()).toBe(404);
  await page.screenshot({path:`.playwright/t15-import-${locale}-desktop.png`,fullPage:true});await page.setViewportSize({width:390,height:844});await expect(page.locator('tbody tr'),'review remains after resizing').toHaveCount(5);expect(await page.locator('table').evaluate(t=>t.getBoundingClientRect().width)).toBeGreaterThanOrEqual(800);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);await page.screenshot({path:`.playwright/t15-import-${locale}-mobile.png`,fullPage:true});
  await page.getByRole('button',{name:labels.selectAll,exact:true}).click();await page.getByRole('button',{name:labels.confirm,exact:true}).click();await page.getByRole('button',{name:labels.prepare,exact:true}).click();await expect(page).toHaveURL(/\/admin\/batches\/[a-f0-9-]+$/);
  const batchId=new URL(page.url()).pathname.split('/').at(-1)!;await driver('import-prepare',run,batchId);await page.reload();await page.getByRole('checkbox',{name:batch.confirm,exact:true}).check();await page.getByRole('button',{name:batch.commit,exact:true}).click();await expect(page.getByRole('status')).toHaveText(batch.states.queued);
  expect((await driver('import-execute',run,batchId)).claimed).toBe(2);await page.reload();await expect(page.getByRole('status')).toHaveText(batch.states.completed);
  expect(await driver('import-facts',run,batchId)).toEqual({contactCount:1,contactOnly:true,changes:2,roles:10,memberships:0,locale:'zh-HK'});
  expect((await driver('import-execute',run,batchId)).claimed).toBe(0);expect((await driver('import-facts',run,batchId)).changes).toBe(2);
 });
}
