import {expect, test} from "@playwright/test";

const locales = [
  {prefix: "", lang: "en"},
  {prefix: "/zh", lang: "zh-HK"},
] as const;

for (const locale of locales) {
  for (const path of ["directory", "events", "documents", "billing"] as const) {
    test(`${locale.lang} protects the localized member ${path} route`, async ({page}) => {
      const response = await page.goto(`${locale.prefix}/portal/${path}`);
      expect(response?.status()).toBeLessThan(400);
      const url = new URL(page.url());
      expect(url.pathname).toBe(`${locale.prefix}/join` || "/join");
      expect(["/portal", `/portal/${path}`]).toContain(url.searchParams.get("next"));
      await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
    });
  }
}