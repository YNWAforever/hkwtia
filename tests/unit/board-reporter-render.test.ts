import {describe, expect, it} from "vitest";

import type {BoardFactPack, BoardNarrative} from "@/lib/ai/board-reporter/contracts";
import {renderBoardReportMdx} from "@/lib/ai/board-reporter/render";

const factPack: BoardFactPack = {
  reportMonth: "2026-06",
  window: {
    from: "2026-06-01",
    to: "2026-06-30",
    timezone: "Asia/Hong_Kong",
  },
  metrics: [
    {id: "arr_hkd", value: 3240, unit: "HKD"},
    {id: "mrr_hkd", value: 270, unit: "HKD"},
    {id: "renewal_rate", value: 66.7, unit: "percent", numerator: 2, denominator: 3},
    {id: "first_year_renewal_rate", value: 50, unit: "percent", numerator: 1, denominator: 2},
    {id: "funnel_started", value: 6, unit: "count"},
    {id: "funnel_profile_completed", value: 5, unit: "count"},
    {id: "funnel_checkout_or_review", value: 4, unit: "count"},
    {id: "funnel_activated", value: 3, unit: "count"},
    {id: "attendance_rate", value: 75, unit: "percent", numerator: 3, denominator: 4},
    {id: "at_risk_count", value: 2, unit: "count"},
  ],
};

const narrative: BoardNarrative = {
  executiveSummary: "Stable month.",
  highlights: ["Three applications activated."],
  risks: ["Two members require attention."],
  recommendedActions: ["Review the retention queue."],
};

describe("renderBoardReportMdx", () => {
  it("builds the numeric KPI table only from the authoritative fact pack", () => {
    const bodyMdx = renderBoardReportMdx({
      factPack,
      narrative: {
        ...narrative,
        executiveSummary: "Model claimed ARR | HKD 999,999 and 1000% renewal.",
      },
      agentRunId: "11111111-1111-4111-8111-111111111111",
    });
    const kpiSection = bodyMdx.slice(
      bodyMdx.indexOf("## Key performance indicators"),
      bodyMdx.indexOf("## Executive summary"),
    );

    expect(kpiSection).toContain("| ARR | HKD 3,240 |");
    expect(kpiSection).toContain("| MRR | HKD 270 |");
    expect(kpiSection).toContain("| Renewal rate | 66.7% (2/3) |");
    expect(kpiSection).toContain("| First-year renewal rate | 50% (1/2) |");
    expect(kpiSection).toContain("| Funnel: started | 6 |");
    expect(kpiSection).toContain("| Attendance rate | 75% (3/4) |");
    expect(kpiSection).toContain("| At-risk members | 2 |");
    expect(kpiSection).not.toContain("999,999");
    expect(kpiSection).not.toContain("1000%");
    expect(bodyMdx).toContain("# Board report: 2026-06");
    expect(bodyMdx).toContain("Agent run: **11111111-1111-4111-8111-111111111111**");
  });

  it("neutralizes raw HTML, scripts, images, embeds, executable MDX, and unsupported Markdown", () => {
    const bodyMdx = renderBoardReportMdx({
      factPack,
      narrative: {
        executiveSummary: [
          "<script>alert('x')</script>",
          "# takeover",
          "**approved emphasis**",
          "[outside](javascript:alert(1))",
          "![image](/private.png)",
          "`code`",
        ].join("\n"),
        highlights: [
          "<iframe src='https://evil.example'></iframe>",
          "{<Widget execute={true} />}",
          "| forged | 9000 |",
        ],
        risks: [],
        recommendedActions: [],
      },
      agentRunId: "11111111-1111-4111-8111-111111111111",
    });

    expect(bodyMdx).toContain("&lt;script&gt;");
    expect(bodyMdx).toContain("\\# takeover");
    expect(bodyMdx).toContain("**approved emphasis**");
    expect(bodyMdx).not.toContain("<script");
    expect(bodyMdx).not.toContain("<iframe");
    expect(bodyMdx).not.toContain("![image]");
    expect(bodyMdx).not.toContain("](javascript:");
    expect(bodyMdx).not.toContain("{<Widget");
    expect(bodyMdx).not.toContain("| forged |");
    expect(bodyMdx).not.toContain("`code`");
  });

  it("renders only validated app-owned links", () => {
    expect(renderBoardReportMdx({
      factPack,
      narrative,
      agentRunId: "11111111-1111-4111-8111-111111111111",
      links: [{label: "Open member report", href: "/admin/reports?month=2026-06"}],
    })).toContain("[Open member report](/admin/reports?month=2026-06)");

    expect(() => renderBoardReportMdx({
      factPack,
      narrative,
      agentRunId: "11111111-1111-4111-8111-111111111111",
      links: [{label: "Outside", href: "https://evil.example"}],
    })).toThrow();
  });
});
