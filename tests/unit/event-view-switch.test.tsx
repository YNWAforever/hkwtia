import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const {pathState, routerReplace, searchState} = vi.hoisted(() => ({
  pathState: {current: "/events"},
  routerReplace: vi.fn(),
  searchState: {current: new URLSearchParams()},
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => pathState.current,
  useRouter: () => ({replace: routerReplace}),
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchState.current,
}));

import {EventViewSwitch} from "@/components/marketing/event-view-switch";

const labels = {label: "Switch how events are displayed", cards: "Cards", calendar: "By date"};

describe("EventViewSwitch", () => {
  beforeEach(() => {
    pathState.current = "/events";
    routerReplace.mockReset();
    searchState.current = new URLSearchParams();
  });

  it("marks Cards as pressed and Calendar as not pressed when ?view is absent", () => {
    render(<EventViewSwitch labels={labels} />);

    expect(screen.getByRole("button", {name: "Cards"})).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", {name: "By date"})).toHaveAttribute("aria-pressed", "false");
  });

  it("marks Calendar as pressed when ?view=calendar", () => {
    searchState.current = new URLSearchParams("view=calendar");
    render(<EventViewSwitch labels={labels} />);

    expect(screen.getByRole("button", {name: "By date"})).toHaveAttribute("aria-pressed", "true");
  });

  it("adds view=calendar while preserving the existing status param", () => {
    searchState.current = new URLSearchParams("status=past");
    render(<EventViewSwitch labels={labels} />);

    fireEvent.click(screen.getByRole("button", {name: "By date"}));

    expect(routerReplace).toHaveBeenCalledWith("/events?status=past&view=calendar");
  });

  it("removes the view param when switching back to Cards", () => {
    searchState.current = new URLSearchParams("status=past&view=calendar");
    render(<EventViewSwitch labels={labels} />);

    fireEvent.click(screen.getByRole("button", {name: "Cards"}));

    expect(routerReplace).toHaveBeenCalledWith("/events?status=past");
  });
});
