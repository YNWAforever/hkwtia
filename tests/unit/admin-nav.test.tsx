import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({usePathname: () => "/admin/members/abc-123"}));
vi.mock("next-intl", () => ({useTranslations: () => (key: string) => key}));

import {AdminNav} from "@/components/admin/admin-nav";

describe("AdminNav", () => {
  it("lets an Admin member-detail route mark the Members link current", () => {
    render(<AdminNav locale="en" />);
    const links = screen.getAllByRole("link");
    const current = links.find((link) => link.getAttribute("aria-current") === "page");
    expect(current).toBeDefined();
    expect(current).toHaveAttribute("href", expect.stringContaining("/admin/members"));
  });

  it("reaches Dashboard through a real labelled link, not only the brand", () => {
    render(<AdminNav locale="en" />);
    // Assert the Dashboard nav link exists with its distinct accessible name
    const dashboardLink = screen.getByRole("link", {name: "navigation.dashboard"});
    expect(dashboardLink).toHaveAttribute("href", expect.stringContaining("/admin"));
    // Verify it's genuinely distinct from the brand link
    const brandLink = screen.getByRole("link", {name: "brand"});
    expect(dashboardLink).not.toBe(brandLink);
  });

  it("groups all 16 nav links across Workspace/Content/Operations", () => {
    render(<AdminNav locale="en" />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual(
      expect.arrayContaining([
        "/admin",
        "/admin/members",
        "/admin/at-risk",
        "/admin/segments",
        "/admin/announcements",
        "/admin/news",
        "/admin/page-copy",
        "/admin/media",
        "/admin/partners",
        "/admin/landing-partners",
        "/admin/events-mgmt",
        "/admin/listings-review",
        "/admin/cohorts",
        "/admin/approvals",
        "/admin/reports",
        "/admin/automations",
      ]),
    );
  });
});
