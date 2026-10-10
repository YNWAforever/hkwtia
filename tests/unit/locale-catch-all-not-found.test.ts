import {existsSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

// Round 28: a URL that matched no route (/terms, /zh/programs/nope) never entered the [locale]
// tree, so Next served its bare built-in 404 — English only, no header or footer, and no
// <html lang> (axe: html-has-lang). A catch-all inside [locale] sends those URLs to
// app/[locale]/not-found.tsx, the branded and translated page, still with a 404 status.
describe("[locale] catch-all", () => {
  it("routes every unmatched path to the locale's not-found page", async () => {
    const {default: CatchAll} = await import("@/app/[locale]/[...rest]/page");
    expect(() => CatchAll()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("has the branded not-found page to land on", () => {
    expect(existsSync(resolve(process.cwd(), "app/[locale]/not-found.tsx"))).toBe(true);
  });
});
