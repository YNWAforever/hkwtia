import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {DesktopMegaNavigation} from "@/components/layout/desktop-mega-navigation";
import {localizeNavigation} from "@/config/navigation";

const route = vi.hoisted(() => ({pathname: "/events"}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => route.pathname,
  Link: ({href, onClick, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    />,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub);

const groups = localizeNavigation((key) => key).groups;

describe("DesktopMegaNavigation", () => {
  beforeEach(() => { route.pathname = "/events"; });

  it("renders the four triggers in approved order and marks only group state on the trigger", () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const nav = screen.getByRole("navigation", {name: "Primary navigation"});
    const triggers = Array.from(nav.querySelectorAll("button"));

    expect(triggers.map((trigger) => trigger.textContent?.trim())).toEqual([
      "groups.eventsProgrammes.label",
      "groups.membershipEcosystem.label",
      "groups.impactInsights.label",
      "groups.aboutWtia.label",
    ]);
    expect(triggers[0]).toHaveAttribute("data-current", "true");
    expect(triggers[0]).not.toHaveAttribute("aria-current");
  });

  it("uses Radix arrow, Home, and End movement between triggers", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const triggers = screen.getAllByRole("button");
    triggers[0]?.focus();
    fireEvent.keyDown(triggers[0]!, {key: "ArrowRight"});
    await waitFor(() => expect(triggers[1]).toHaveFocus());
    fireEvent.keyDown(triggers[1]!, {key: "End"});
    await waitFor(() => expect(triggers[3]).toHaveFocus());
    fireEvent.keyDown(triggers[3]!, {key: "Home"});
    await waitFor(() => expect(triggers[0]).toHaveFocus());
  });

  it("opens from the keyboard, exposes canonical anchors, closes on navigation, and returns focus", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const trigger = screen.getAllByRole("button")[0]!;
    trigger.focus();
    fireEvent.keyDown(trigger, {key: "Enter"});
    // fireEvent does not emulate the browser's native Enter-to-click default.
    fireEvent.click(trigger);

    const events = await screen.findByRole("link", {name: "links.events"});
    expect(events).toHaveAttribute("href", "/events");
    expect(events).toHaveAttribute("aria-current", "page");
    fireEvent.click(events);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(trigger).toHaveFocus();
  });

  it("closes on Escape and restores the initiating trigger", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" />);
    const trigger = screen.getAllByRole("button")[0]!;
    trigger.focus();
    // Radix opens a horizontal menu via native trigger activation; ArrowDown enters an already open panel.
    fireEvent.click(trigger);
    expect(await screen.findByRole("link", {name: "links.events"})).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? trigger, {key: "Escape"});
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
