import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({usePathname: () => "/portal/company/listing"}));
vi.mock("next-intl", () => ({useTranslations: () => (key: string) => key}));
vi.mock("@/components/portal/portal-sign-out-button", () => ({
  PortalSignOutButton: () => <button type="button">Sign out</button>,
}));

import {PortalNav} from "@/components/portal/portal-nav";

describe("PortalNav", () => {
  it("marks the showcase listing link current, not Dashboard, at /portal/company/listing", () => {
    render(<PortalNav locale="en" />);
    const links = screen.getAllByRole("link");
    const current = links.find((link) => link.getAttribute("aria-current") === "page");
    expect(current).toBeDefined();
    expect(current).toHaveAttribute("href", expect.stringContaining("/portal/company/listing"));

    const dashboardLink = links.find((link) => link.getAttribute("href") === "/portal");
    expect(dashboardLink).toBeDefined();
    expect(dashboardLink).not.toHaveAttribute("aria-current");
  });

  it("renders exactly one real sign-out button, not the old inert span", () => {
    render(<PortalNav locale="en" />);
    expect(screen.getAllByRole("button", {name: /sign out/i})).toHaveLength(1);
    expect(screen.queryByText("signOut", {selector: "span.sr-only"})).not.toBeInTheDocument();
  });

  it("renders every one of the Portal's 8 primary nav links plus a brand link", () => {
    render(<PortalNav locale="en" />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/portal",
        "/portal/profile",
        "/portal/company",
        "/portal/company/listing",
        "/portal/directory",
        "/portal/events",
        "/portal/documents",
        "/portal/billing",
      ]),
    );
  });
});
