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
});
