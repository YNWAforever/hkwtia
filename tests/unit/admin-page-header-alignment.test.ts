import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * cohorts and automations were the only two of the 26 Admin pages whose
 * eyebrow/title/description header was delegated into a business-logic child
 * component (CohortKanban, AutomationDashboardView) instead of being rendered
 * by the page itself. Both now render their header directly in page.tsx via
 * the shared InternalPageHeader primitive, and their former child components
 * no longer duplicate that markup.
 */
const delegatedHeaderPages = [
  {
    page: "app/[locale]/(admin)/admin/cohorts/page.tsx",
    component: "components/admin/cohort-kanban.tsx",
    hasEyebrow: false,
  },
  {
    page: "app/[locale]/(admin)/admin/automations/page.tsx",
    component: "components/admin/automation-dashboard.tsx",
    hasEyebrow: true,
  },
] as const;

function readSource(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("admin page header alignment", () => {
  it.each(delegatedHeaderPages)(
    "renders $page's header via InternalPageHeader, not $component",
    ({page, component, hasEyebrow}) => {
      const pageSource = readSource(page);
      const componentSource = readSource(component);

      expect(pageSource).toContain(
        'import {InternalPageHeader} from "@/components/internal-shell/page-header";',
      );
      expect(pageSource).toContain("<InternalPageHeader");
      expect(pageSource).toContain('title={t("title")}');
      expect(pageSource).toContain('description={t("description")}');
      if (hasEyebrow) {
        expect(pageSource).toContain('eyebrow={t("eyebrow")}');
      } else {
        expect(pageSource).not.toContain('eyebrow={t("eyebrow")}');
      }

      expect(componentSource).not.toContain("<h1");
      expect(componentSource).not.toContain("InternalPageHeader");
    },
  );

  it("keeps InternalPageHeader itself as the one place the admin h1 style is defined", () => {
    expect(readSource("components/internal-shell/page-header.tsx")).toContain("<h1");
  });
});
