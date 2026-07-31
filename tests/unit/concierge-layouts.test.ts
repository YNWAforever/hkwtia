import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Concierge layout translation loading", () => {
  it.each([
    "app/[locale]/(public)/layout.tsx",
    "app/[locale]/(member)/portal/layout.tsx",
  ])("loads scoped translations in parallel without the full catalog: %s", (file) => {
    const layout = source(file);

    expect(layout).not.toContain("getMessages");
    expect(layout).toContain("Promise.all");
    expect(layout).toMatch(/namespace:\s*["']Concierge["']/);
    expect(layout).toContain("concierge.raw(key)");
  });
});
