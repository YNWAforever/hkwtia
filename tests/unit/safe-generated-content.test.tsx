import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {BoardDraftList} from "@/components/admin/board-draft-list";
import {SafeGeneratedContent} from "@/components/admin/safe-generated-content";
import {SafeStructuredContent} from "@/components/content/safe-structured-content";

const tableHeaders = {
  kpi: "Localized KPI heading",
  value: "Localized value heading",
} as const;

describe("safe generated content", () => {
  it("maps the app-composed report grammar to safe structural React nodes", () => {
    const content = [
      "# Board report: 2026-06",
      "",
      "Reporting window: **2026-06-01 to 2026-06-30** (Asia/Hong_Kong)",
      "",
      "## Key performance indicators",
      "",
      "| KPI | Value |",
      "| --- | ---: |",
      "| ARR | HKD 3,240 |",
      "| Renewal rate | 66.7% (2/3) |",
      "",
      "## Executive summary",
      "",
      "Narrative: Performance was **stable**.",
      "",
      "## Highlights",
      "",
      "- Renewal improved",
      "- [At-risk members](/en/admin/at-risk)",
    ].join("\n");

    const html = renderToStaticMarkup(<SafeGeneratedContent content={content} tableHeaders={tableHeaders}/>);

    expect(html).toContain("<h1");
    expect(html).toContain("Board report: 2026-06</h1>");
    expect(html.match(/<h2/g)).toHaveLength(3);
    expect(html).toContain("<p");
    expect(html).toContain("<strong>2026-06-01 to 2026-06-30</strong>");
    expect(html).toContain("<strong>stable</strong>");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain('href="/en/admin/at-risk"');
    expect(html).toContain("Localized KPI heading");
    expect(html).toContain("Localized value heading");
    expect(html).not.toContain(">KPI<");
    expect(html).not.toContain(">Value<");
  });

  it("keeps raw HTML, executable MDX, images, embeds, and unsafe links inert", () => {
    const payload = [
      "<script>globalThis.compromised = true</script>",
      "<img src=x onerror=alert(1)>",
      "<iframe src=\"https://example.test\"></iframe>",
      "import Widget from './widget'",
      "export const compromised = true",
      "{dangerousExpression()}",
      "<Widget secret=\"private@example.test\" />",
      "![external image](https://example.test/image.png)",
      "[external](https://example.test)",
      "[unsafe](javascript:alert(1))",
      "[protocol relative](//example.test/path)",
    ].join("\n");

    const html = renderToStaticMarkup(<SafeGeneratedContent content={payload} tableHeaders={tableHeaders}/>);

    expect(html).toContain("&lt;script&gt;globalThis.compromised = true&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;iframe src=&quot;https://example.test&quot;&gt;&lt;/iframe&gt;");
    expect(html).toContain("import Widget from");
    expect(html).toContain("export const compromised");
    expect(html).toContain("{dangerousExpression()}");
    expect(html).toContain("&lt;Widget secret=&quot;private@example.test&quot; /&gt;");
    expect(html).toContain("![external image](https://example.test/image.png)");
    expect(html).toContain("[external](https://example.test)");
    expect(html).not.toMatch(/<script>|<img|<iframe|<Widget/);
    expect(html).not.toMatch(/href="https:|href="javascript:|href="\/\//);
  });

  it("renders the bounded bilingual build-log grammar without creating another h1", () => {
    const content = [
      "## Build notes 建置紀錄",
      "",
      "Published **evidence** with [an internal route](/zh/ai-ops).",
      "",
      "- First result",
      "- 第二項結果",
    ].join("\n");

    const html = renderToStaticMarkup(<SafeStructuredContent
      content={content}
      mode="build-log"
      tableHeaders={tableHeaders}
    />);

    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2");
    expect(html).toContain("Build notes 建置紀錄</h2>");
    expect(html).toContain("<p");
    expect(html).toContain("<strong>evidence</strong>");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain('href="/zh/ai-ops"');
  });

  it("enforces the complete safe build-log h2 boundary", () => {
    const oneCharacter = "字";
    const oneHundredTwentyCharacters = "a".repeat(120);
    const content = [
      `## ${oneCharacter}`,
      `## ${oneHundredTwentyCharacters}`,
      "## ",
      "## unsafe < heading",
      "## unsafe > heading",
      "## unsafe { heading",
      "## unsafe } heading",
      `## ${"b".repeat(121)}`,
    ].join("\n");

    const html = renderToStaticMarkup(<SafeStructuredContent
      content={content}
      mode="build-log"
      tableHeaders={tableHeaders}
    />);

    expect(html.match(/<h2/g)).toHaveLength(2);
    expect(html).toContain(`${oneCharacter}</h2>`);
    expect(html).toContain(`${oneHundredTwentyCharacters}</h2>`);
    expect(html).not.toContain("<h1");
    expect(html).toContain("## ");
    expect(html).toContain("&lt; heading");
    expect(html).toContain("&gt; heading");
  });

  it("keeps hostile build-log input inert and rejects unsafe or unbounded headings", () => {
    const hostile = [
      "<script>alert(1)</script>",
      "import Widget from './widget'",
      "{dangerousExpression()}",
      "[external](https://attacker.example)",
      "[unsafe](javascript:alert(1))",
      "# Page-owned title",
      "## {unsafe heading}",
      `## ${"a".repeat(121)}`,
    ].join("\n");

    const html = renderToStaticMarkup(<SafeStructuredContent
      content={hostile}
      mode="build-log"
      tableHeaders={tableHeaders}
    />);

    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("import Widget from");
    expect(html).toContain("{dangerousExpression()}");
    expect(html).toContain("[external](https://attacker.example)");
    expect(html).toContain("[unsafe](javascript:alert(1))");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<h2");
    expect(html).not.toMatch(/<script>|href="https:|href="javascript:/);
  });

  it("does not include executable HTML or MDX rendering mechanisms", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/content/safe-structured-content.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    expect(source).not.toMatch(/next-mdx-remote/);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\beval\s*\(/);
    expect(source).not.toContain('scope="col">KPI<');
    expect(source).not.toContain('scope="col">Value<');
  });

  it("keeps SafeGeneratedContent as the board-report compatibility wrapper", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/admin/safe-generated-content.tsx"),
      "utf8",
    );

    expect(source).toContain("SafeStructuredContent");
    expect(source).toContain('mode="board-report"');
  });

  it("renders Board Reporter drafts as read-only summaries with a staff preview link and no inline body", () => {
    const html = renderToStaticMarkup(<BoardDraftList
      drafts={[{
        id: "11111111-1111-4111-8111-111111111111",
        slug: "board-report-2026-06",
        titleEn: "Board report: 2026-06",
        titleZh: "董事會報告：2026-06",
        reportMonth: "2026-06",
        agentRunId: "22222222-2222-4222-8222-222222222222",
        agentRunStatus: "completed",
        createdAt: new Date("2026-07-20T01:00:00.000Z"),
      }]}
      labels={{
        heading: "Board Reporter drafts", description: "Read-only previews", empty: "No drafts", preview: "Open preview",
        reportMonth: "Report month", createdAt: "Created", agentRunStatus: "Agent run status", unavailable: "Not available",
        statuses: {running: "Running", disabled: "Disabled", completed: "Completed", failed: "Failed", escalated: "Escalated"},
      }}
      locale="en"
    />);

    expect(html).toContain("Board Reporter drafts");
    expect(html).toContain("Board report: 2026-06");
    expect(html).toContain("Report month");
    expect(html).toContain("2026-06");
    expect(html).toContain("Agent run status");
    expect(html).toContain("Completed");
    expect(html).toContain('href="/en/admin/reports/board-drafts/11111111-1111-4111-8111-111111111111"');
    expect(html).not.toContain("alert(1)");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html).not.toMatch(/>Send</);
    expect(html).not.toMatch(/>Publish</);
  });
});
