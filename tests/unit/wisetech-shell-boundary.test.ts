import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

const implementationFiles = [
  "config/navigation.ts",
  "components/layout/site-header.tsx",
  "components/layout/site-footer.tsx",
  "components/layout/desktop-mega-navigation.tsx",
  "components/layout/mobile-navigation.tsx",
  "app/[locale]/(public)/layout.tsx",
  "components/layout/announcement-bar.tsx",
  "components/layout/announcement-dismiss.tsx",
];

describe("WiseTech PR2 source boundary", () => {
  it("does not import donor runtime modules or create another shell owner", () => {
    for (const file of implementationFiles) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/WiseTechSite|FullInnerPages|ExpansionPages|\.graphify|YNWAforever\/wisetech/);
    }
  });

  it("does not expose donor-only five-group or retired paths", () => {
    const navigation = readFileSync(resolve(process.cwd(), "config/navigation.ts"), "utf8");
    for (const sourceOnly of [
      "/activities", "/members", "/solutions", "/programmes/", "/gba", "/insights",
      "events-activities", "members-solutions", "programmes-gba", "insights-about",
    ]) expect(navigation, sourceOnly).not.toMatch(new RegExp(`['\"]${sourceOnly}['\"]`));
  });
});
