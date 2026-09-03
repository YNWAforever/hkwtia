import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

// Every shell file this work package wrote or rewrote, not a subset of them. The list stood at
// eleven while seven of the shell's own files went unscanned, and one of those seven —
// lib/ai/concierge-prompts.ts — carried the donor filename in a comment the whole time. A gate
// that reads a hard-coded list is only as good as the list, so an addition here is part of
// adding a shell file.
const implementationFiles = [
  "config/navigation.ts",
  "components/layout/site-header.tsx",
  "components/layout/site-footer.tsx",
  "components/layout/desktop-mega-navigation.tsx",
  "components/layout/mega-menu-panel.tsx",
  "components/layout/mobile-navigation.tsx",
  "app/[locale]/(public)/layout.tsx",
  "components/layout/announcement-bar.tsx",
  "components/layout/announcement-dismiss.tsx",
  "components/layout/header-shell.tsx",
  "components/layout/footer-newsletter.tsx",
  "components/layout/dual-brand-lockup.tsx",
  "components/layout/locale-switcher.tsx",
  "components/ui/accordion.tsx",
  "components/ui/navigation-menu.tsx",
  "components/ui/sheet.tsx",
  "components/ai/concierge-widget.tsx",
  "lib/public-shell/hero-variant.ts",
  "lib/ai/concierge-prompts.ts",
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
