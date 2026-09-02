import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {MobileNavigation} from "@/components/layout/mobile-navigation";
import {localizeNavigation} from "@/config/navigation";

const {routerReplace, searchState} = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchState: {current: new URLSearchParams()},
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
  Link: ({href, onClick, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) =>
    <a href={href} onClick={(event) => { onClick?.(event); event.preventDefault(); }} {...props} />,
  useRouter: () => ({replace: routerReplace}),
}));
vi.mock("next/navigation", () => ({useSearchParams: () => searchState.current}));
vi.mock("next/image", () => ({
  default: ({priority: _priority, ...props}: React.ImgHTMLAttributes<HTMLImageElement> & {priority?: boolean}) => <img {...props} />,
}));

const navigation = localizeNavigation((key) => key);
const labels = {
  open: "Open navigation",
  close: "Close navigation",
  title: "Navigation",
  description: "Explore WiseTech Hong Kong",
  priority: "Priority actions",
  utilities: "Utility navigation",
  exploreEcosystem: "Explore the ecosystem",
  search: "Search WiseTech",
  viewOverview: "View overview",
  english: "EN",
  chinese: "中文",
  switchToEnglish: "Switch to English",
  switchToChinese: "Switch to Chinese",
};
const brand = {
  homeLabel: "WiseTech Hong Kong home",
  publicName: "WiseTech Hong Kong",
  descriptor: "The evolving AI+ industry platform",
  logoAlt: "WTIA",
};

describe("MobileNavigation", () => {
  it("puts event and join actions first, then utilities, the eyebrow and the four groups", () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    fireEvent.click(screen.getByRole("button", {name: labels.open}));
    const dialog = screen.getByRole("dialog");

    const priority = within(dialog).getByTestId("mobile-priority-actions");
    const priorityLinks = within(priority).getAllByRole("link");
    expect(priorityLinks.map((link) => link.getAttribute("href"))).toEqual(["/events", "/join"]);
    expect(priorityLinks[0]).toHaveClass("mobile-event-action");

    const utilities = within(dialog).getByRole("navigation", {name: labels.utilities});
    expect(within(utilities).getByRole("link", {name: labels.search})).toHaveAttribute("href", "/showcase");
    expect(within(utilities).getByRole("link", {name: "actions.memberSignIn"})).toHaveAttribute("href", "/portal");
    expect(within(utilities).getByRole("button", {name: labels.switchToChinese}).parentElement).toHaveClass("[&_button]:min-w-11");

    expect(within(dialog).getByText(labels.exploreEcosystem)).toHaveClass("eyebrow");
    expect(within(dialog).getAllByRole("button", {expanded: false})).toHaveLength(4);

    // app/styles/wisetech-shell.css styles the trigger through `.mobile-accordion > h3 > button`,
    // because Radix wraps it in Accordion.Header and the port's own `.mobile-accordion > button`
    // rules never reach it. If a Radix release changes that element, those rules stop applying
    // silently — the menu keeps working and only the donor type and the current-trigger contrast
    // fix quietly disappear. Pin the wrapper so the break is named here instead.
    expect(dialog.querySelector(".mobile-accordion")!.children[0].tagName).toBe("H3");
  });

  it("shows at most five leaves per group and closes each panel with a view-all link", () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    fireEvent.click(screen.getByRole("button", {name: labels.open}));
    fireEvent.click(screen.getByRole("button", {name: "groups.eventsProgrammes.label"}));

    const panel = document.querySelector(".mobile-accordion-panel")!;
    const links = within(panel as HTMLElement).getAllByRole("link");
    expect(links).toHaveLength(6);
    expect(links.slice(0, 5).map((link) => link.getAttribute("href"))).toEqual([
      "/events", "/launchpad", "/programs/hkict", "/programs/asa", "/programs/tct",
    ]);
    expect(links[5]).toHaveClass("mobile-view-all");
    expect(links[5]).toHaveAccessibleName(labels.viewOverview);
    expect(links[5]).toHaveAttribute("href", "/events");
  });

  it("opens a group, marks the exact current leaf, closes on navigation, and returns focus", async () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    const trigger = screen.getByRole("button", {name: labels.open});
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", {name: "groups.eventsProgrammes.label"}));
    const eventLink = screen.getByRole("link", {name: "links.events"});
    expect(eventLink).toHaveAttribute("aria-current", "page");
    fireEvent.click(eventLink);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("resets stale accordion state after Escape and reopen", async () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    const trigger = screen.getByRole("button", {name: labels.open});
    fireEvent.click(trigger);
    const group = screen.getByRole("button", {name: "groups.eventsProgrammes.label"});
    fireEvent.click(group);
    expect(group).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(screen.getByRole("dialog"), {key: "Escape"});
    await waitFor(() => expect(trigger).toHaveFocus());
    fireEvent.click(trigger);
    expect(screen.getByRole("button", {name: "groups.eventsProgrammes.label"})).toHaveAttribute("aria-expanded", "false");
  });
  it("closes and resets after the locale action while preserving locale navigation", async () => {
    routerReplace.mockReset();
    searchState.current = new URLSearchParams("filter=member");
    window.history.replaceState(null, "", "/events?filter=member#schedule");
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} brand={brand} />);
    const trigger = screen.getByRole("button", {name: labels.open});
    fireEvent.click(trigger);
    const group = screen.getByRole("button", {name: "groups.eventsProgrammes.label"});
    fireEvent.click(group);
    fireEvent.click(screen.getByRole("button", {name: labels.switchToChinese}));
    expect(routerReplace).toHaveBeenCalledWith("/events?filter=member#schedule", {locale: "zh-HK"});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    fireEvent.click(trigger);
    expect(screen.getByRole("button", {name: "groups.eventsProgrammes.label"})).toHaveAttribute("aria-expanded", "false");
  });
});
