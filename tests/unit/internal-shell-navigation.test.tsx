import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it} from "vitest";

import {InternalNavigation} from "@/components/internal-shell/navigation";

const groups = [
  {
    id: "primary",
    links: [
      {id: "dashboard", href: "/portal", label: "Dashboard"},
      {id: "profile", href: "/portal/profile", label: "My profile"},
    ],
  },
];
const labels = {navigationLabel: "Member portal navigation", openMenu: "Open menu", closeMenu: "Close menu"};

describe("InternalNavigation", () => {
  it("marks the exact current path as aria-current and renders every link", () => {
    render(<InternalNavigation groups={groups} labels={labels} currentPath="/portal" />);
    expect(screen.getByRole("link", {name: "Dashboard"})).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", {name: "My profile"})).not.toHaveAttribute("aria-current");
  });

  it("gives every link a 44px-minimum tap target", () => {
    render(<InternalNavigation groups={groups} labels={labels} currentPath="/portal" />);
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toMatch(/min-h-11|min-h-\[44px\]/);
    }
  });

  it("opens the mobile drawer, closes on Escape, and returns focus to the trigger", async () => {
    render(<InternalNavigation groups={groups} labels={labels} currentPath="/portal" />);
    const trigger = screen.getByRole("button", {name: labels.openMenu});
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {name: labels.navigationLabel});
    expect(dialog).toBeInTheDocument();
    fireEvent.keyDown(document, {key: "Escape"});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("renders an optional children slot (e.g. for a sign-out control)", () => {
    render(
      <InternalNavigation groups={groups} labels={labels} currentPath="/portal">
        <button type="button">Sign out</button>
      </InternalNavigation>,
    );
    expect(screen.getByRole("button", {name: "Sign out"})).toBeInTheDocument();
  });

  it("marks only the most-specific link current when routes have ancestor/descendant relationships", () => {
    const nestedGroups = [
      {
        id: "portals",
        links: [
          {id: "portal_root", href: "/portal", label: "Portal"},
          {id: "company", href: "/portal/company", label: "Company"},
          {id: "listing", href: "/portal/company/listing", label: "Showcase listing"},
        ],
      },
    ];
    // At /portal/company/listing, only "Showcase listing" should be marked current, not "Company" or "Portal"
    render(<InternalNavigation groups={nestedGroups} labels={labels} currentPath="/portal/company/listing" />);
    expect(screen.getByRole("link", {name: "Portal"})).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", {name: "Company"})).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", {name: "Showcase listing"})).toHaveAttribute("aria-current", "page");
  });
});
