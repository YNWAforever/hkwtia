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

  /**
   * A link click inside the panel closes it through `onNavigate`, but Back and Forward are
   * navigations no click reports. This nav is mounted by app/[locale]/(public)/layout.tsx,
   * which survives them, and Radix's NavigationMenu listens for keydown, pointerdown and
   * focusin only — its dist bundle mentions no `popstate`, `hashchange` or `window.history` —
   * so nothing else would have closed the panel over the newly rendered page.
   */
  it("closes the panel when the route changes underneath it", async () => {
    // A fresh element each pass: React bails out of re-rendering a subtree whose element is
    // referentially identical to the last one (tests/unit/concierge-shell.test.tsx:80-82).
    const nav = () => (
      <DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />
    );
    const view = render(nav());
    const trigger = screen.getAllByRole("button")[0]! as HTMLButtonElement;
    trigger.focus();
    activateButtonWithEnter(trigger);
    await screen.findByRole("link", {name: "links.events"});
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    route.pathname = "/showcase";
    view.rerender(nav());

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "false"));
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

  it("keeps Radix's focus proxy out of the tab order without disarming after the first open", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const trigger = screen.getAllByRole("button")[0]! as HTMLButtonElement;
    trigger.focus();
    activateButtonWithEnter(trigger);
    await screen.findByRole("link", {name: "links.events"});

    // The observer in components/ui/navigation-menu.tsx watches the Radix root, which is the
    // inner <nav> the primitive renders, not the .desktop-nav landmark around it.
    const root = screen.getByRole("navigation", {name: "Primary navigation"}).querySelector("nav")!;

    // While a menu is open Radix renders a VisuallyHidden focus proxy beside the trigger with
    // aria-hidden and tabIndex 0 (node_modules/@radix-ui/react-navigation-menu/dist/index.mjs
    // :348-356). axe scores that a serious aria-hidden-focus violation, so nothing aria-hidden
    // inside the root may stay focusable.
    const proxies = [...root.querySelectorAll<HTMLElement>('[aria-hidden="true"][tabindex]')];
    expect(proxies.length).toBeGreaterThan(0);
    for (const proxy of proxies) expect(proxy.tabIndex).toBe(-1);
    expect(root.querySelectorAll('[aria-hidden="true"][tabindex="0"]')).toHaveLength(0);

    // A proxy appended after mount is neutralised too. This is what makes the effect's empty
    // dependency array correct: one subscription with subtree: true covers every later open,
    // so a one-shot pass keyed on the open value is not needed and would be wasted work.
    const late = document.createElement("span");
    late.setAttribute("aria-hidden", "true");
    late.setAttribute("tabindex", "0");
    root.append(late);
    await waitFor(() => expect(late.tabIndex).toBe(-1));

    // The trigger keeps its own place in the tab order; only the hidden proxy loses one.
    expect(trigger.tabIndex).toBe(0);
  });

  it("renders the donor panel wrappers, named columns and an arrow on every link", async () => {
    render(<DesktopMegaNavigation groups={groups} primaryLabel="Primary navigation" exploreLabel="explore" viewOverviewLabel="viewOverview" />);
    const trigger = screen.getAllByRole("button")[0]! as HTMLButtonElement;
    trigger.focus();
    activateButtonWithEnter(trigger);

    const events = await screen.findByRole("link", {name: "links.events"});
    const panel = events.closest(".mega-menu-v2")!;
    expect(panel.querySelector(".mega-menu-main")).not.toBeNull();
    expect(panel.querySelector(".mega-columns")).not.toBeNull();

    // Each column is a named group, so its links are read under their own heading rather than
    // as one undifferentiated list. .mega-column stays a div and .mega-column-title stays a <p>,
    // because the port styles both by those selectors.
    const columns = [...panel.querySelectorAll(".mega-column")];
    expect(columns).toHaveLength(groups[0]!.columns.length);
    columns.forEach((column, index) => {
      expect(column).toHaveAttribute("role", "group");
      const title = column.querySelector(".mega-column-title")!;
      expect(title.tagName).toBe("P");
      expect(title.id).not.toBe("");
      expect(column.getAttribute("aria-labelledby")).toBe(title.id);
      expect(title).toHaveTextContent(groups[0]!.columns[index]!.label);
    });
    expect(new Set(columns.map((column) => column.getAttribute("aria-labelledby"))).size)
      .toBe(columns.length);

    // The port styles the trailing arrow through `.mega-column a span` and
    // `.mega-menu-heading > a span` (app/styles/wisetech.css:308 and :1058), so every leaf, the
    // overview link and the feature call to action must carry one -- and it must stay
    // aria-hidden so the glyph never reaches the link's accessible name.
    const arrowLinks = [
      ...panel.querySelectorAll(".mega-column a"),
      panel.querySelector(".mega-menu-heading > a")!,
      panel.querySelector(".mega-feature-v2 > a")!,
    ];
    expect(arrowLinks).toHaveLength(groups[0]!.columns.flatMap((column) => column.links).length + 2);
    for (const link of arrowLinks) {
      const arrow = link.querySelector('span[aria-hidden="true"]');
      expect(arrow, link.getAttribute("href") ?? "").not.toBeNull();
      expect(arrow!.textContent).toBe("\u2197");
    }
  });
});
