import {expect, test} from "@playwright/test";

import {publicRoutes} from "../../config/public-routes";

// WP-8 row 8.4: the spec's "manual /zh walk" as a repeatable, read-only check. Every public
// route under /zh must answer 200, declare a Chinese document language, carry exactly one h1,
// leak no raw message key or JS placeholder into the text, and link nowhere with the internal
// /zh-HK prefix (CLAUDE.md boundary 5).
const rawKey = /\b[A-Z][A-Za-z]+(?:\.[a-z][A-Za-z]+){2,}\b/;   // e.g. Programmes.hero.title

test.describe("zh-HK walk", () => {
  for (const route of publicRoutes) {
    const zhPath = route === "/" ? "/zh" : `/zh${route}`;
    // `/join` is the one public route served by the `(join)` route group, whose layout renders
    // its own <main> without the `main-content` id that the landmark contract pins on the public
    // layout only. Its h1 is still inside the main landmark, so scope to `main` there.
    const landmark = route === "/join" ? "main" : "main#main-content";
    test(`${zhPath} renders in Chinese without leaks`, async ({page}) => {
      const response = await page.goto(zhPath, {waitUntil: "domcontentloaded"});
      expect(response?.status(), zhPath).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", /^zh/);
      await expect(page.locator(`${landmark} h1`)).toHaveCount(1);
      const text = await page.locator("body").innerText();
      expect(text, `${zhPath} raw key`).not.toMatch(rawKey);
      expect(text, `${zhPath} placeholder`).not.toMatch(/\bundefined\b|\[object Object\]|NaN/);
      const badHrefs = await page.locator('a[href^="/zh-HK/"], a[href="/zh-HK"]').count();
      expect(badHrefs, `${zhPath} /zh-HK href`).toBe(0);
    });
  }
});
