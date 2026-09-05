import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

function source(relative: string): string {
  return readFileSync(resolve(process.cwd(), relative), "utf8");
}

describe("Concierge layout translation loading", () => {
  it.each([
    // The public layout fetches Common, Concierge and Announcement namespaces together, so it
    // still needs Promise.all to load them in parallel.
    {file: "app/[locale]/(public)/layout.tsx", fetchesInParallel: true},
    // Task 7 moved Portal's own nav-label translations client-side (PortalNav now resolves them
    // itself via next-intl's useTranslations), so this layout fetches only the Concierge
    // namespace -- a single getTranslations call, with no second namespace left to parallelize.
    {file: "app/[locale]/(member)/portal/layout.tsx", fetchesInParallel: false},
  ])("loads scoped translations without the full catalog: $file", ({file, fetchesInParallel}) => {
    const layout = source(file);

    expect(layout).not.toContain("getMessages");
    if (fetchesInParallel) {
      expect(layout).toContain("Promise.all");
    } else {
      expect(layout).not.toContain("Promise.all");
    }
    expect(layout).toMatch(/namespace:\s*["']Concierge["']/);
    expect(layout).toContain("concierge.raw(key)");
    expect(layout.match(/<ConciergeWidget\b/g)).toHaveLength(1);
  });
});
