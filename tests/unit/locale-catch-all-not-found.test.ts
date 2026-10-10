import {existsSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

// Round 28: a URL that matched no route (/terms, /zh/programs/nope) never entered the [locale]
// tree, so Next served its bare built-in 404 — English only, no header or footer, and no
// <html lang> (axe: html-has-lang). A catch-all inside the (public) group sends those URLs to
// app/[locale]/(public)/not-found.tsx — the branded page, header and footer included, still 404.
describe("[locale] catch-all", () => {
  it("routes every unmatched path to the locale's not-found page", async () => {
    const {default: CatchAll} = await import("@/app/[locale]/(public)/[...rest]/page");
    expect(() => CatchAll()).toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  });

  it("has the branded not-found page to land on", () => {
    expect(existsSync(resolve(process.cwd(), "app/[locale]/(public)/not-found.tsx"))).toBe(true);
  });
});
