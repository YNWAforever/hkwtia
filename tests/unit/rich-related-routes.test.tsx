import {render, screen} from "@testing-library/react";
import type {AnchorHTMLAttributes, ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({href, children, ...props}: AnchorHTMLAttributes<HTMLAnchorElement> & {href: string; children: ReactNode}) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("RichRelatedRoutes", () => {
  it("renders one link per item inside the donor 3-column related grid", async () => {
    const {RichRelatedRoutes} = await import("@/components/wt/rich-related-routes");
    render(
      <RichRelatedRoutes
        items={[
          {href: "/about/history", label: "Since 2001", title: "Our history", description: "Milestones from twenty-five years."},
          {href: "/about/chairman", label: "Leadership", title: "Chairman's message", description: "A message from our chairman."},
          {href: "/about/committees", label: "Governance", title: "Committees that turn participation into action.", description: "How committees support governance."},
        ]}
      />,
    );

    expect(document.querySelector(".rich-related-grid")).toBeInTheDocument();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    expect(links[0]).toHaveAttribute("href", "/about/history");
    expect(screen.getByRole("heading", {level: 3, name: "Our history"})).toBeVisible();
    expect(screen.getByText("Milestones from twenty-five years.")).toBeVisible();
  });
});
