import {readFileSync} from "node:fs";

import {expect, test} from "@playwright/test";

import {publicRoutes} from "../../config/public-routes";
import {buildRawMessageKeyPattern} from "../helpers/raw-message-key";

// WP-8 row 8.4: the spec's "manual /zh walk" as a repeatable, read-only check. Every public
// route under /zh must answer 200, declare a Chinese document language, carry exactly one h1,
// leak no raw message key or JS placeholder into the text, and link nowhere with the internal
// /zh-HK prefix (CLAUDE.md boundary 5).
//
// The raw-key pattern is built from the bundle's real top-level namespaces (read the same way
// the sibling specs read the bundles), not a shape guess: a two-segment key such as
// `Join.backToMembership` is caught, while `WTIA.org.hk` in the footer cannot match.
const namespaces = Object.keys(
  JSON.parse(readFileSync(new URL("../../messages/zh-HK.json", import.meta.url), "utf8")) as Record<string, unknown>
);
const rawKey = buildRawMessageKeyPattern(namespaces);

test.describe("zh-HK walk", () => {
  for (const route of publicRoutes) {
    const zhPath = route === "/" ? "/zh" : `/zh${route}`;
    // `/join` is the one public route served by the `(join)` route group, whose layout renders
    // its own <main> without the `main-content` id that the landmark contract pins on the public
    // layout only. Its h1 is still inside the main landmark, so scope to `main` there.
    // Follow-up, not this PR: app/[locale]/(join)/layout.tsx renders <main> without
    // id="main-content" and no skip link, a landmark-contract gap for the (join) group.
    const landmark = route === "/join" ? "main" : "main#main-content";
    test(`${zhPath} renders in Chinese without leaks`, async ({page}) => {
      const response = await page.goto(zhPath, {waitUntil: "domcontentloaded"});
      expect(response?.status(), zhPath).toBe(200);
      await expect(page.locator("html")).toHaveAttribute("lang", /^zh/);
      await expect(page.locator(`${landmark} h1`)).toHaveCount(1);
      const text = await page.locator("body").innerText();
      expect(text, `${zhPath} raw key`).not.toMatch(rawKey);
      expect(text, `${zhPath} placeholder`).not.toMatch(/\bundefined\b|\[object Object\]|\bNaN\b/);
      // Relative and absolute forms: `/zh-HK/...`, `/zh-HK`, and `https://host/zh-HK/...`.
      const badHrefs = await page.locator('a[href*="/zh-HK/"], a[href$="/zh-HK"]').count();
      expect(badHrefs, `${zhPath} /zh-HK href`).toBe(0);
    });
  }
});
