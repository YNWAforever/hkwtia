import fs from 'node:fs';
import {expect,test} from '@playwright/test';
const run='00000000-0000-4000-8000-000000001001';
const draft='00000000-0000-4000-8000-000000001003';
const enabled=process.env.AUDIT_ISOLATED_ACCEPTANCE==='1';
test.use({trace:'off',video:'off'});
test.describe('confirmed isolated segment pagination',()=>{
 test.skip(!enabled,'Requires confirmed isolated DB/Auth and synthetic test identities');
 test.beforeEach(async({context,baseURL})=>{
 expect(process.env.NEON_PROJECT_ID).toBe('solitary-wave-52860119');
 expect(new URL(process.env.DATABASE_URL_TEST!).hostname).toBe('ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech');
 expect(new URL(baseURL!).hostname).not.toBe('hkwtia.vercel.app');
 expect(process.env.M2_TEST_SUPERADMIN_EMAIL).toMatch(/@.*example\.test$/);
 const login=await context.request.post('/api/auth/sign-in/email',{headers:{Origin:baseURL!},data:{email:process.env.M2_TEST_SUPERADMIN_EMAIL,password:process.env.M2_TEST_SUPERADMIN_PASSWORD,callbackURL:'/admin'}});
 expect(login.status()).toBe(200);
 });
 for(const [locale,count]of [['zh-HK',101],['en',51]]as const){
 test(locale+' traverses '+count+' rows and retains context on previous and filter reset',async({page,context,baseURL})=>{
 await context.addCookies([{name:'NEXT_LOCALE',value:locale,url:baseURL!}]);
 const path=locale==='zh-HK'?'/zh/admin/segments':'/admin/segments';
 const next=locale==='zh-HK'?'下一頁':'Next page';const previous=locale==='zh-HK'?'上一頁':'Previous page';
 const sector='FR'+count+'-'+run;
 const response=await page.goto(path+'?sector='+sector+'&campaignDraft='+draft+'&limit=50');
 expect(response?.status()).toBe(200);
 const ids:string[]=[];const pages:string[][]=[];let previousHref:string|null=null;
 do{
 await expect(page.locator('table tbody tr').first()).toBeVisible();
 const names=await page.locator('table tbody th').allTextContents();pages.push(names);ids.push(...names);
 expect(names.length).toBeLessThanOrEqual(50);
 const url=new URL(page.url());expect(url.searchParams.get('sector')).toBe(sector);expect(url.searchParams.get('campaignDraft')).toBe(draft);expect(url.searchParams.get('limit')).toBe('50');
 previousHref=(await page.getByRole('link',{name:previous,exact:true}).count())?await page.getByRole('link',{name:previous,exact:true}).getAttribute('href'):null;
 if(!(await page.getByRole('link',{name:next,exact:true}).count()))break;
 await page.getByRole('link',{name:next,exact:true}).click();
 }while(pages.length<4);
 expect(ids).toHaveLength(count);expect(new Set(ids).size).toBe(count);expect(previousHref).not.toBeNull();
 await page.getByRole('link',{name:previous,exact:true}).click();
 await expect(page.locator('table tbody th').first()).toHaveText(pages[pages.length-2][0]);
 expect(await page.locator('table tbody th').allTextContents()).toEqual(pages[pages.length-2]);
 await page.getByRole('navigation',{name:locale==='zh-HK'?'符合條件的會員':'Matching members'}).scrollIntoViewIfNeeded();
 await page.waitForLoadState('networkidle');
 fs.mkdirSync('docs/audits/hkwtia-2026-10-01-remediation/evidence/t03',{recursive:true});
 await page.screenshot({path:'docs/audits/hkwtia-2026-10-01-remediation/evidence/t03/'+locale+'-pagination.png',mask:[page.locator('table tbody td:nth-child(3)')]});
 const before=new URL(page.url());before.searchParams.set('sector','FR51-'+run);
 await page.goto(before.toString());
 await expect(page.locator('table tbody th').first()).toHaveText(pages[0][0]);
 const form=page.locator('form[method="get"]');
 await form.locator('[name="sector"]').fill('FR101-'+run);
 await form.getByRole('button',{name:locale==='zh-HK'?'預覽':'Preview',exact:true}).click();
 await expect(page.locator('table tbody th').first()).toHaveText(pages[0][0]);
 expect(new URL(page.url()).searchParams.get('campaignDraft')).toBe(draft);expect(new URL(page.url()).searchParams.has('cursor')).toBe(false);
 fs.writeFileSync('docs/audits/hkwtia-2026-10-01-remediation/evidence/t03/'+locale+'-browser.json',JSON.stringify({checkedAt:new Date().toISOString(),environment:'confirmed isolated localhost DB/Auth',locale,count,pageLengths:pages.map(p=>p.length),uniqueRows:new Set(ids).size,previousRoundTrip:true,filterReset:true,draftAndLimitRetained:true,provider:'synthetic password',production:false},null,2));
 });
 }
});
