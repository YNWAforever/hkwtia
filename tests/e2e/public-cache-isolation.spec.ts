import {readFileSync} from "node:fs";
import {expect,test} from "@playwright/test";
import {missingM2IdentityEnvironment,signInForM2} from "../fixtures/m2-auth";
const en=JSON.parse(readFileSync(new URL("../../messages/en.json",import.meta.url),"utf8")) as typeof import("../../messages/en.json");
const zh=JSON.parse(readFileSync(new URL("../../messages/zh-HK.json",import.meta.url),"utf8")) as typeof import("../../messages/zh-HK.json");

const missing=missingM2IdentityEnvironment();
const isolated=process.env.AUDIT_ISOLATED_ACCEPTANCE === "true";
test.describe("isolated public cache acceptance",()=>{
  test.skip(!isolated || missing.length>0,`Requires AUDIT_ISOLATED_ACCEPTANCE=true and isolated M2 identities: ${missing.join(", ")}`);
  test.beforeEach(async({baseURL})=>{
    const target=new URL(baseURL!);
    expect(target.hostname).not.toBe("hkwtia.vercel.app");
    expect(["localhost","127.0.0.1"].includes(target.hostname)||target.hostname.endsWith(".vercel.app")).toBe(true);
  });
  test("member A, company member B and guest see only the public bilingual news projection",async({browser,baseURL})=>{
    const contexts=await Promise.all([browser.newContext({baseURL}),browser.newContext({baseURL}),browser.newContext({baseURL})]);
    try {
      const pages=await Promise.all(contexts.map(context=>context.newPage()));
      await signInForM2(pages[0]!,"member");await signInForM2(pages[1]!,"company-admin");
      for(const [path,title] of [["/news",en.News.title],["/zh/news",zh.News.title]]) {
        const bodies=[];
        for(const page of pages){await page.goto(path!);await expect(page.getByRole("heading",{level:1,name:title!})).toBeVisible();bodies.push(await page.locator("main").innerText());}
        expect(bodies[0]).toBe(bodies[1]);expect(bodies[1]).toBe(bodies[2]);
        for(const body of bodies)for(const key of ["M2_TEST_MEMBER_EMAIL","M2_TEST_COMPANY_ADMIN_EMAIL"]){expect(body).not.toContain(process.env[key]!);}
      }
    }finally{await Promise.all(contexts.map(context=>context.close()));}
  });
  test("a staff bilingual copy save invalidates warmed public entries in separate guest contexts",async({page,browser,baseURL})=>{
    await signInForM2(page,"staff");
    const contexts=await Promise.all([browser.newContext({baseURL}),browser.newContext({baseURL})]);
    const guests=await Promise.all(contexts.map(context=>context.newPage()));
    await page.goto("/admin/page-copy/Privacy");
    const english=page.locator('textarea[name="copy:en:title"]');
    const chinese=page.locator('textarea[name="copy:zh-HK:title"]');
    const before=[await english.inputValue(),await chinese.inputValue()];
    const token=`Synthetic cache ${Date.now()}`;
    try {
      await guests[0]!.goto("/privacy");await guests[1]!.goto("/zh/privacy");
      await english.fill(token);await chinese.fill(`測試 ${token}`);
      await page.locator('button[type="submit"]').click();await expect(page.getByRole("status")).toBeVisible();
      await guests[0]!.reload();await guests[1]!.reload();
      await expect(guests[0]!.getByRole("heading",{level:1})).toHaveText(token);
      await expect(guests[1]!.getByRole("heading",{level:1})).toHaveText(`測試 ${token}`);
    }finally{
      await page.goto("/admin/page-copy/Privacy");await english.fill(before[0]!);await chinese.fill(before[1]!);
      await page.locator('button[type="submit"]').click();await expect(page.getByRole("status")).toBeVisible();
      await Promise.all(contexts.map(context=>context.close()));
    }
  });
});
