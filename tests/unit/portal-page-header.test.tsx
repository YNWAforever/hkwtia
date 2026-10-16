import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {PortalPageHeader} from "@/components/portal/page-header";

describe("PortalPageHeader", () => {
  it("renders one h1 and omits the eyebrow and lead when not given", () => {
    const html = renderToStaticMarkup(<PortalPageHeader title="Events" />);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("<h1>Events</h1>");
    expect(html).not.toContain("status-label");
    expect(html).not.toContain("portal-welcome-lead");
  });

  it("renders eyebrow, lead and children in order", () => {
    const html = renderToStaticMarkup(
      <PortalPageHeader eyebrow="Member" title="Events" lead="What is on"><p>extra</p></PortalPageHeader>,
    );
    expect(html).toContain('class="portal-welcome"');
    expect(html.indexOf("status-label")).toBeLessThan(html.indexOf("<h1>"));
    expect(html.indexOf("<h1>")).toBeLessThan(html.indexOf("portal-welcome-lead"));
    expect(html.indexOf("portal-welcome-lead")).toBeLessThan(html.indexOf("<p>extra</p>"));
  });
});
