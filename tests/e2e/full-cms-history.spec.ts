import fs from 'node:fs';
import {expect,test} from '@playwright/test';
import {signInRemediationIdentity} from '../fixtures/full-remediation-browser';
const evidence='docs/audits/hkwtia-2026-10-01-remediation/evidence/t04/';
test.use({trace:'off',video:'off'});
test.describe('isolated CMS history and tab storage',()=>{
 test.skip(process.env.AUDIT_ISOLATED_ACCEPTANCE!=='1','Requires confirmed isolated DB/Auth and synthetic identities');
 test.beforeEach(async({context,baseURL,page})=>{await signInRemediationIdentity(context,baseURL!);page.on('dialog',dialog=>dialog.accept());});
 for(const [locale,width,restore]of [['zh-HK',1440,'恢復草稿'],['en',390,'Restore draft']]as const){
 test(locale+' recovers bilingual edits after real browser history',async({page,context,baseURL})=>{
 await page.setViewportSize({width,height:960});await context.addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);
 const path=(locale==='zh-HK'?'/zh':'')+'/admin/page-copy';
 await page.goto(path);await page.locator('a[href="'+path+'/Home"]').click();await page.waitForURL('**/page-copy/Home');
 await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic T04 unsaved English');await page.locator('textarea[name="copy:zh-HK:hero.title"]').fill('合成 T04 未發布草稿');
 await expect(page.getByText(locale==='zh-HK'?/在此分頁暫存/:/Saved in this tab/)).toBeVisible();
 await page.goBack();await page.waitForURL('**/page-copy');await page.goForward();await page.waitForURL('**/page-copy/Home');
 // Next may retain this Client Component in memory; both retained and restored paths must keep the edits.
 if(await page.getByRole('button',{name:restore,exact:true}).count())await page.getByRole('button',{name:restore,exact:true}).click();
 await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic T04 unsaved English');await expect(page.locator('textarea[name="copy:zh-HK:hero.title"]')).toHaveValue('合成 T04 未發布草稿');
 // A full reload removes the in-memory path and proves the explicit session-storage recovery.
 await page.reload();await expect(page.getByRole('button',{name:restore,exact:true})).toBeVisible();await page.getByRole('button',{name:restore,exact:true}).click();
 await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic T04 unsaved English');await expect(page.locator('textarea[name="copy:zh-HK:hero.title"]')).toHaveValue('合成 T04 未發布草稿');
 await page.locator('textarea[name="copy:en:hero.title"]').scrollIntoViewIfNeeded();await page.waitForLoadState('networkidle');await page.screenshot({path:evidence+locale+'-recovered-'+width+'.png'});
 fs.writeFileSync(evidence+locale+'-history.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated DB/Auth',locale,width,field:'hero.title',nativeBackForward:true,explicitRestoreAfterReload:true,bilingualRecovered:true,published:false},null,2));
 });
 }
 test('denied storage warns truthfully and keeps edits in the form',async({page})=>{
 await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('hkwtia:cms-draft:'))throw new DOMException('Test denied storage','SecurityError');return original.call(this,key,value);};});
 await page.goto('/zh/admin/page-copy/Home');await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic denied-storage draft');
 await expect(page.getByRole('alert').filter({hasText:'無法暫存草稿'})).toContainText('無法暫存草稿');await expect(page.getByText(/在此分頁暫存/)).toHaveCount(0);await expect(page.locator('textarea[name="copy:en:hero.title"]')).toHaveValue('Synthetic denied-storage draft');
 await page.waitForLoadState('networkidle');await page.screenshot({path:evidence+'zh-storage-unavailable.png'});
 fs.writeFileSync(evidence+'storage-denied.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated browser',storageDenied:true,warningVisible:true,falseSavedClaim:false,editsRemain:true,published:false},null,2));
 });
 test('another authorized synthetic identity cannot see the prior identity draft',async({page,context,baseURL})=>{
 await page.goto('/zh/admin/page-copy/Home');await page.locator('textarea[name="copy:en:hero.title"]').fill('Synthetic identity A private draft');
 const logout=await context.request.post('/api/auth/sign-out',{data:{},headers:{Origin:baseURL!}});expect(logout.status()).toBe(200);
 await signInRemediationIdentity(context,baseURL!,'STAFF');await page.goto('/zh/admin/page-copy/Home');
 await expect(page.getByRole('button',{name:'恢復草稿',exact:true})).toHaveCount(0);await expect(page.locator('textarea[name="copy:en:hero.title"]')).not.toHaveValue('Synthetic identity A private draft');
 fs.writeFileSync(evidence+'identity-isolation.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated Auth',syntheticLogoutAndStaffLogin:true,priorDraftDisclosed:false,published:false},null,2));
 });
});
