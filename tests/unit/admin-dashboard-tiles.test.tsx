import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {DashboardTiles, type DashboardTile} from "@/components/admin/dashboard-tiles";

const labels = {
  heading: "Queues",
  description: "What is waiting for staff attention right now.",
  view: "Open",
  unavailable: "Unavailable",
} as const;

function render(tiles: readonly DashboardTile[], locale: "en" | "zh-HK" = "en") {
  return renderToStaticMarkup(
    <DashboardTiles labels={labels} locale={locale} tiles={tiles}/>,
  );
}

const approvals = (count: number | null): DashboardTile =>
  ({id: "approvals", href: "/admin/approvals", label: "Pending approvals", count});

describe("admin dashboard tiles", () => {
  it("shows a queue size and a way into the queue", () => {
    const html = render([approvals(3)]);

    expect(html).toContain("Pending approvals");
    expect(html).toContain(">3<");
    expect(html).toContain('href="/admin/approvals"');
  });

  it("renders an empty queue as zero, not as unavailable", () => {
    const html = render([approvals(0)]);

    expect(html).toContain(">0<");
    expect(html).not.toContain("Unavailable");
  });

  // "Nothing to approve" and "we could not ask" are different answers, and only
  // one of them means staff can stop looking. A failed read must never render
  // as a clean zero.
  it("renders a failed read as unavailable, not as zero", () => {
    const html = render([approvals(null)]);

    expect(html).toContain("Unavailable");
    expect(html).not.toContain(">0<");
  });

  it("prefixes the Chinese links with /zh, not the raw locale", () => {
    const html = render([approvals(1)], "zh-HK");

    expect(html).toContain('href="/zh/admin/approvals"');
    expect(html).not.toContain("/zh-HK/admin");
  });

  it("keeps every tile independent, so one failure does not blank the rest", () => {
    const html = render([
      approvals(null),
      {id: "news", href: "/admin/news", label: "Draft news posts", count: 2},
    ]);

    expect(html).toContain("Unavailable");
    expect(html).toContain(">2<");
    expect(html).toContain('href="/admin/news"');
  });
});
