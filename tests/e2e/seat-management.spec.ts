import {expect, test} from "@playwright/test";

test.describe("member seat management", () => {
  test("company seat route is protected and localized", async ({page}) => {
    await page.goto("/portal/company/seats");
    const url = new URL(page.url());
    expect(url.pathname.endsWith("/join")).toBe(true);
    expect(["/portal", "/portal/company/seats"]).toContain(url.searchParams.get("next"));
  });

  test("Chinese company seat route is protected", async ({page}) => {
    await page.goto("/zh/portal/company/seats");
    const url = new URL(page.url());
    expect(url.pathname.endsWith("/join")).toBe(true);
    expect(["/portal", "/portal/company/seats"]).toContain(url.searchParams.get("next"));
  });
});