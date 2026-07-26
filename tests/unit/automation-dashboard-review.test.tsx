import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {
  AutomationDashboardView,
  type AutomationDashboardLabels,
  type RetryAutomationAction,
} from "@/components/admin/automation-dashboard";
import type {AutomationDashboard} from "@/lib/admin/automations";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

const action: RetryAutomationAction = async () => ({
  status: "success",
  code: "scheduled",
});
const dashboard: AutomationDashboard = {
  asOf: "2027-01-15T10:00:00.000Z",
  counts: {due: 0, upcoming: 0, failed: 0, processing: 0},
  jobs: [],
  rows: [],
  nextCursor: null,
};

describe("automation dashboard review semantics", () => {
  it.each([
    {
      locale: "en" as const,
      labels: en.Admin.automations as Record<string, string>,
      expected: "Evaluated at",
      rejected: "Snapshot as of",
    },
    {
      locale: "zh-HK" as const,
      labels: zh.Admin.automations as Record<string, string>,
      expected: "評估時間",
      rejected: "資料截點",
    },
  ])("labels asOf as a live count evaluation boundary in $locale", ({
    locale,
    labels,
    expected,
    rejected,
  }) => {
    expect(labels.evaluatedAt).toBe(expected);
    expect(labels.snapshot).toBeUndefined();

    const html = renderToStaticMarkup(
      <AutomationDashboardView
        action={action}
        dashboard={dashboard}
        labels={labels as AutomationDashboardLabels}
        locale={locale}
      />,
    );
    expect(html).toContain(expected);
    expect(html).not.toContain(rejected);
  });
});
