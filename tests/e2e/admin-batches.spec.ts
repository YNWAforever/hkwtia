import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {expect,test,type Page} from "@playwright/test";
import {missingM2IdentityEnvironment,signInForM2} from "../fixtures/m2-auth";
const en=JSON.parse(readFileSync(new URL("../../messages/en.json",import.meta.url),"utf8")) as typeof import("../../messages/en.json");
const zh=JSON.parse(readFileSync(new URL("../../messages/zh-HK.json",import.meta.url),"utf8")) as typeof import("../../messages/zh-HK.json");
const runProcess=promisify(execFile);
async function driver(mode:string,run:string,batchId?:string){
  const {stdout}=await runProcess(process.execPath,['--conditions=react-server','--import','tsx','tests/fixtures/audit-batch-driver.ts',mode,run,...(batchId?[batchId]:[])],{timeout:120000});
  return JSON.parse(stdout) as {name:string;ids:string[];claimed:number;changed:number;items:{target_id:string;state:string;attempt_count:number;effect_key:string}[];effects:{target_id:string;n:number}[]};
}
async function counter(page:Page,label:string,value:number){await expect(page.locator('dl > div').filter({has:page.locator('dt',{hasText:new RegExp(`^${label}$`)})}).locator('dd')).toHaveText(String(value));}
const missing=missingM2IdentityEnvironment();
for(const [locale,prefix,messages] of [['en','',en],['zh-HK','/zh',zh]] as const){
 test(`${locale}: ten selected members, two controlled failures, retry only failures`,async({page,baseURL})=>{
  test.skip(missing.length>0||process.env.AUDIT_ISOLATED_ACCEPTANCE!=='true'||process.env.AUDIT_BATCH_WORKER_PAUSED!=='true','Requires isolated M2 identities, exact DB allowlist and a paused scheduled batch worker');
  expect(new URL(baseURL!).hostname).not.toBe('hkwtia.vercel.app');
  const run=randomUUID(),fixture=await driver('seed',run),member=messages.Admin.members,batch=messages.Admin.batches;
  await signInForM2(page,'staff');await page.goto(`${prefix}/admin/members?q=${encodeURIComponent(fixture.name)}`);
  await expect(page.locator('tbody tr')).toHaveCount(10);
  for(let i=0;i<10;i++)await page.getByRole('checkbox',{name:member.selection.row.replace('{name}',`${fixture.name} ${i}`),exact:true}).check();
  await page.getByRole('combobox',{name:member.batch.language,exact:true}).filter({hasNot:page.locator('option[value=""]')}).selectOption('zh-HK');
  await page.getByLabel(member.batch.reason,{exact:true}).fill('Synthetic acceptance language correction');
  await page.getByRole('button',{name:member.batch.preview,exact:true}).click();
  await expect(page).toHaveURL(/\/admin\/batches\/[a-f0-9-]+$/);
  const batchId=new URL(page.url()).pathname.split('/').at(-1)!;
  await driver('prepare',run,batchId);await page.reload();
  await counter(page,batch.total,10);await counter(page,batch.eligible,10);
  await expect(page.getByRole('status')).toHaveText(batch.states.ready);
  await page.getByRole('button',{name:batch.commit,exact:true}).click();
  await expect(page.getByRole('status')).toHaveText(batch.states.queued);
  expect((await driver('fail',run,batchId)).claimed).toBe(10);await page.reload();
  await counter(page,batch.counters.succeeded,8);await counter(page,batch.counters.failed,2);
  const partial=await driver('facts',run,batchId);expect(partial.changed).toBe(8);expect(partial.effects).toHaveLength(8);
  // Leave and reopen: progress must come from persisted state.
  await page.goto(`${prefix}/admin/members`);await page.goto(`${prefix}/admin/batches/${batchId}`);
  await page.getByRole('button',{name:batch.retry,exact:true}).click();
  await expect(page.getByRole('status')).toHaveText(batch.states.queued);
  expect((await driver('recover',run,batchId)).claimed).toBe(2);await page.reload();
  await expect(page.getByRole('status')).toHaveText(batch.states.completed);
  await counter(page,batch.counters.succeeded,10);await counter(page,batch.counters.failed,0);
  const final=await driver('facts',run,batchId);expect(final.changed).toBe(10);expect(final.effects).toHaveLength(10);
  expect(final.effects.every(effect=>effect.n===1)).toBe(true);
  expect(final.items.filter(item=>item.attempt_count===1)).toHaveLength(8);expect(final.items.filter(item=>item.attempt_count===2)).toHaveLength(2);
  expect(final.items.map(item=>item.effect_key)).toEqual(partial.items.map(item=>item.effect_key));
 });
}
