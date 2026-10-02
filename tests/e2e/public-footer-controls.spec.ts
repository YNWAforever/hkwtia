import {expect, test} from "@playwright/test";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
type LocaleLabels = {Navigation: {switchToEnglish: string; switchToChinese: string}};
const en: LocaleLabels = JSON.parse(readFileSync("messages/en.json", "utf8"));
const zh: LocaleLabels = JSON.parse(readFileSync("messages/zh-HK.json", "utf8"));

for (const locale of ["en", "zh-HK"] as const) {
  for (const width of [1280, 390]) {
    test(`${locale} footer language control is unobscured at ${width}px and preserves filters`, async ({page}) => {
      const prefix = locale === "en" ? "" : "/zh";
      const labels = locale === "en" ? en : zh;
      const otherLabels = locale === "en" ? zh : en;
      const otherPrefix = locale === "en" ? "/zh" : "";
      await page.setViewportSize({width, height: 800});
      await page.goto(`${prefix}/events?status=past#results`);
      const footer = page.locator("footer");
      const language = footer.getByRole("button", {name: locale === "en" ? labels.Navigation.switchToChinese : labels.Navigation.switchToEnglish});
      await expect(language).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await language.scrollIntoViewIfNeeded();
      const hit = await language.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        const widget = document.querySelector(".concierge-trigger");
        return {
          unobscured: top === button || button.contains(top),
          coveredByConcierge: Boolean(top?.closest(".concierge")),
          button: rect.toJSON(),
          widget: widget?.getBoundingClientRect().toJSON() ?? null,
        };
      });
      const evidence = "docs/audits/hkwtia-2026-10-01-remediation/evidence/t22";
      mkdirSync(evidence, {recursive: true});
      writeFileSync(`${evidence}/footer-${locale}-${width}.json`, JSON.stringify({locale, width, ...hit}, null, 2));
      await page.screenshot({path: `${evidence}/footer-${locale}-${width}.png`});
      expect(hit.unobscured, "Footer locale control must not be covered by the fixed Concierge trigger").toBe(true);
      await language.click();
      await expect.poll(() => {const url = new URL(page.url()); return url.pathname + url.search + url.hash;}).toBe(`${otherPrefix}/events?status=past#results`);
      expect(new URL(page.url()).search).toBe("?status=past");
      expect(new URL(page.url()).hash).toBe("#results");
      const reverse = page.locator("footer").getByRole("button", {name: locale === "en" ? otherLabels.Navigation.switchToEnglish : otherLabels.Navigation.switchToChinese});
      await expect(reverse).toBeEnabled();
      await reverse.focus();
      await expect(reverse).toBeFocused();
      await page.keyboard.press("Enter");
      await expect.poll(() => {const url = new URL(page.url()); return url.pathname + url.search + url.hash;}).toBe(`${prefix}/events?status=past#results`);
      expect(new URL(page.url()).search).toBe("?status=past");
      expect(new URL(page.url()).hash).toBe("#results");
    });
  }
}
