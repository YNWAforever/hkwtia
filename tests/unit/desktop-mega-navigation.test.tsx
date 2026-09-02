import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
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

function activateButtonWithEnter(button: HTMLButtonElement) {
  act(() => {
    const keyDownWasNotPrevented = fireEvent.keyDown(button, {key: "Enter", code: "Enter"});
    if (keyDownWasNotPrevented) button.click();
    fireEvent.keyUp(button, {key: "Enter", code: "Enter"});
  });
}

describe("DesktopMegaNavigation", () => {
  beforeEach(() => { route.pathname = "/events"; });

  it("renders the four triggers in approved order and marks only group state on the trigger", () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const nav = screen.getByRole("navigation", {name: "Primary navigation"});
    const triggers = Array.from(nav.querySelectorAll("button"));

    // The donor trigger ends with a text chevron in an aria-hidden span (commit f91ecc5 :409),
    // so `textContent` now carries a trailing "⌄". Assert the accessible name instead: it both
    // keeps the order check and proves the chevron never reaches assistive technology.
    const labels = [
      "groups.eventsProgrammes.label",
      "groups.membershipEcosystem.label",
      "groups.impactInsights.label",
      "groups.aboutWtia.label",
    ];
    expect(triggers).toHaveLength(labels.length);
    labels.forEach((label, index) => expect(triggers[index]).toHaveAccessibleName(label));
    for (const trigger of triggers) {
      expect(trigger.querySelector('span[aria-hidden="true"]')?.textContent).toBe("⌄");
    }
    expect(triggers[0]).toHaveClass("nav-button", "event-first", "current");
    expect(triggers[0]).toHaveAttribute("data-current", "true");
    expect(triggers[0]).not.toHaveAttribute("aria-current");
  });

  it("uses Radix arrow, Home, and End movement between triggers", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const triggers = screen.getAllByRole("button");
    triggers[0]?.focus();
    fireEvent.keyDown(triggers[0]!, {key: "ArrowRight"});
    await waitFor(() => expect(triggers[1]).toHaveFocus());
    fireEvent.keyDown(triggers[1]!, {key: "End"});
    await waitFor(() => expect(triggers[3]).toHaveFocus());
    fireEvent.keyDown(triggers[3]!, {key: "Home"});
    await waitFor(() => expect(triggers[0]).toHaveFocus());
  });

  it("leaves the panel width to the ported stylesheet instead of a Tailwind arbitrary value", async () => {
    Object.defineProperty(window, "innerWidth", {configurable: true, value: 320});
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const trigger = screen.getAllByRole("button")[0]! as HTMLButtonElement;
    trigger.focus();
    activateButtonWithEnter(trigger);

    const events = await screen.findByRole("link", {name: "links.events"});
    const content = events.closest('[id$="content-events-programmes"]');
    const panel = content?.firstElementChild;
    const viewport = content?.parentElement;

    // The donor sizes the panel itself: `.mega-menu-v2 { width: min(1040px, calc(100% - 40px)) }`
    // (app/styles/wisetech.css:1036-1039). This test was written for the hand-written Tailwind
    // arbitrary values that used to do that job, where an unescaped `calc(100vw-2rem)` silently
    // produced an invalid class; keep that regression unreachable by proving no arbitrary width
    // survives on either element.
    expect(panel).toHaveClass("mega-menu-v2");
    for (const element of [panel, viewport]) {
      expect(element?.className, element?.className).not.toMatch(/calc\(100vw/);
      expect(element?.className, element?.className).not.toMatch(/w-\[/);
    }
  });

  it("opens from Enter, exposes canonical anchors, closes on navigation, and returns focus", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const trigger = screen.getAllByRole("button")[0]! as HTMLButtonElement;
    trigger.focus();
    activateButtonWithEnter(trigger);

    const events = await screen.findByRole("link", {name: "links.events"});
    expect(events).toHaveAttribute("href", "/events");
    expect(events).toHaveAttribute("aria-current", "page");
    fireEvent.click(events);
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    expect(trigger).toHaveFocus();
  });

  it("moves focus from an Enter-opened trigger into the panel and returns it on Escape", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const trigger = screen.getAllByRole("button")[0]! as HTMLButtonElement;
    trigger.focus();
    activateButtonWithEnter(trigger);

    await screen.findByRole("link", {name: "links.events"});
    // Radix's ArrowDown entry focuses the panel's first tabbable element. In the donor grammar
    // (commit f91ecc5 :425-431) that is the heading's "View overview" link, which precedes the
    // columns, not the first column leaf.
    const overview = screen.getByRole("link", {name: "viewOverview"});
    expect(overview).toHaveAttribute("href", "/events");
    fireEvent.keyDown(trigger, {key: "ArrowDown"});
    await waitFor(() => expect(overview).toHaveFocus());
    fireEvent.keyDown(overview, {key: "Escape"});
    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
