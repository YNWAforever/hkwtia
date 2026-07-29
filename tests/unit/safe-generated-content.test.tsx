import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {BoardDraftList} from "@/components/admin/board-draft-list";
import {SafeGeneratedContent} from "@/components/admin/safe-generated-content";

describe("safe generated content", () => {
  it("renders generated script, raw HTML, and MDX syntax as inert text", () => {
    const payload = [
      "<script>globalThis.compromised = true</script>",
      "<img src=x onerror=alert(1)>",
      "<a href=\"javascript:alert(1)\">click</a>",
      "{dangerousExpression()}",
      "<Widget secret=\"private@example.test\" />",
    ].join("\n");

    const html = renderToStaticMarkup(<SafeGeneratedContent content={payload}/>);

    expect(html).toContain("&lt;script&gt;globalThis.compromised = true&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;a href=&quot;javascript:alert(1)&quot;&gt;click&lt;/a&gt;");
    expect(html).toContain("{dangerousExpression()}");
    expect(html).toContain("&lt;Widget secret=&quot;private@example.test&quot; /&gt;");
    expect(html).not.toMatch(/<script>|<img|<a href|<Widget/);
  });

  it("does not include executable HTML or MDX rendering mechanisms", () => {
    const source = readFileSync(
      resolve(process.cwd(), "components/admin/safe-generated-content.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/dangerouslySetInnerHTML/);
    expect(source).not.toMatch(/next-mdx-remote/);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\beval\s*\(/);
  });

  it("renders Board Reporter drafts as read-only cards with provenance and no send or publish controls", () => {
    const html = renderToStaticMarkup(<BoardDraftList
      drafts={[{
        id: "11111111-1111-4111-8111-111111111111",
        slug: "board-report-2026-06",
        titleEn: "Board report: 2026-06",
        titleZh: "董事會報告：2026-06",
        bodyMdx: "<script>alert(1)</script>",
        sourceKey: "board-report:2026-06:board-reporter-v1",
        agentRunId: "22222222-2222-4222-8222-222222222222",
        createdAt: new Date("2026-07-20T01:00:00.000Z"),
      }]}
      labels={{heading: "Board Reporter drafts", description: "Read-only previews", empty: "No drafts", preview: "Draft preview", slug: "Slug", createdAt: "Created", sourceKey: "Source", agentRunId: "Agent run", unavailable: "Not available"}}
      locale="en"
    />);

    expect(html).toContain("Board Reporter drafts");
    expect(html).toContain("Board report: 2026-06");
    expect(html).toContain("board-report:2026-06:board-reporter-v1");
    expect(html).toContain("22222222-2222-4222-8222-222222222222");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
    expect(html).not.toMatch(/>Send</);
    expect(html).not.toMatch(/>Publish</);
  });
});
