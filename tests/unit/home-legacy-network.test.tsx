import {fireEvent, render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/media/url", () => ({isPrivateMediaDeliveryUrl: () => false}));

const labels = {
  eyebrow: "Built on real relationships",
  title: "A network with history",
  note: "Inclusion does not imply a current relationship.",
  viewAllAction: "View all partners",
  previewNote: "Showing {shown} of {total} records in this category.",
  tabs: {supporting: "Supporting Organizations", regional: "Regional Partners", media: "Media Partners"},
};

function partner(id: string) {
  return {id, name: `Partner ${id}`, category: "supporting" as const, websiteUrl: null, logoUrl: null, logoAlt: null, displayOrder: 1, featured: false};
}

describe("LegacyNetwork", () => {
  it("hides entirely when every group is empty", async () => {
    const {LegacyNetwork} = await import("@/components/home/legacy-network");
    const groups = [
      {category: "supporting" as const, partners: []},
      {category: "regional" as const, partners: []},
      {category: "media" as const, partners: []},
    ];
    const {container} = render(<LegacyNetwork groups={groups} labels={labels} />);

    expect(container).toBeEmptyDOMElement();
  });

  it("shows the supporting tab by default, with padded counts, and switches tabs on click", async () => {
    const {LegacyNetwork} = await import("@/components/home/legacy-network");
    const groups = [
      {category: "supporting" as const, partners: [partner("1"), partner("2")]},
      {category: "regional" as const, partners: [partner("3")]},
      {category: "media" as const, partners: []},
    ];
    render(<LegacyNetwork groups={groups} labels={labels} />);

    const supportingTab = screen.getByRole("button", {name: /Supporting Organizations/});
    expect(within(supportingTab).getByText("02")).toBeInTheDocument();
    expect(screen.getByText("Partner 1")).toBeInTheDocument();
    expect(screen.getByText(labels.previewNote.replace("{shown}", "2").replace("{total}", "2"))).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {name: /Regional Partners/}));
    expect(screen.getByText("Partner 3")).toBeInTheDocument();
    expect(screen.queryByText("Partner 1")).not.toBeInTheDocument();
  });
});
