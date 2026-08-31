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

const navigation = localizeNavigation((key) => key);
const labels = {
  open: "Open navigation",
  close: "Close navigation",
  title: "Navigation",
  description: "Explore WiseTech Hong Kong",
  english: "EN",
  chinese: "中文",
  switchToEnglish: "Switch to English",
  switchToChinese: "Switch to Chinese",
};

describe("MobileNavigation", () => {
  it("puts event and join actions first, then the four groups and utilities", () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: labels.open}));
    const dialog = screen.getByRole("dialog");
    const priority = within(dialog).getByTestId("mobile-priority-actions");
    expect(within(priority).getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([
      "/events", "/join",
    ]);
    expect(within(dialog).getAllByRole("button", {expanded: false})).toHaveLength(4);
    expect(within(dialog).getByRole("link", {name: "actions.memberSignIn"})).toHaveAttribute("href", "/portal");
    expect(within(dialog).getByRole("button", {name: labels.switchToChinese}).parentElement).toHaveClass("[&_button]:min-w-11");
  });

  it("opens a group, marks the exact current leaf, closes on navigation, and returns focus", async () => {
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
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
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
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
    render(<MobileNavigation locale="en" navigation={navigation} labels={labels} />);
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
