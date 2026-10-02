import {expect, test} from "@playwright/test";
import {writeFileSync} from "node:fs";
import {missingM2IdentityEnvironment, signInForM2} from "../fixtures/m2-auth";
import {finalAuditIsolatedDatabaseUrl} from "../fixtures/audit-isolated-db";

test("private sidebar waits for intentional navigation before fetching other protected routes", async ({page}) => {
  const missing=missingM2IdentityEnvironment();
  test.skip(missing.length > 0 || !finalAuditIsolatedDatabaseUrl(), "Exact isolated DB/Auth and synthetic staff required");
  await signInForM2(page, "staff");
  const prefetches: {pathname:string;prefetch:boolean}[]=[];
  page.on("request",request=>{
    const url=new URL(request.url());
    const headers=request.headers();
    const prefetch=headers["next-router-prefetch"]==="1" || headers.purpose?.includes("prefetch")===true;
    if(prefetch && /^\/(?:zh\/)?admin(?:\/|$)/.test(url.pathname))prefetches.push({pathname:url.pathname,prefetch:true});
  });
  await page.goto("/admin");
  const sidebar=page.getByTestId("admin-desktop-sidebar");
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("navigation").getByRole("link")).toHaveCount(25);
  await expect(page.locator("main h1").first()).toBeVisible();
  // Observe real built-browser idle/hover behavior, including Next's viewport prefetch.
  await page.waitForTimeout(6000);
  await sidebar.locator('a[href="/admin/members"]').hover();
  await page.waitForTimeout(2000);
  writeFileSync(".playwright/t22-private-prefetch-safe.json",JSON.stringify({observedAt:new Date().toISOString(),role:"synthetic staff",visibleNavigationLinks:25,observationWindowMs:8000,prefetches,credentialsLogged:false,production:false},null,2));
  expect(prefetches).toEqual([]);
  await sidebar.locator('a[href="/admin/members"]').click();
  await expect(page).toHaveURL(/\/admin\/members$/);
  await expect(page.locator("main h1").first()).toBeVisible();
});
