import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {LocaleSwitcher} from "@/components/layout/locale-switcher";

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

const labels = {
  englishLabel: "English",
  chineseLabel: "繁體中文",
  switchToEnglishLabel: "Switch to English",
  switchToChineseLabel: "切換至繁體中文",
};

describe("LocaleSwitcher", () => {
  beforeEach(() => {
    pathState.current = "/events";
    routerReplace.mockReset();
    searchState.current = new URLSearchParams();
    window.history.replaceState(null, "", "/");
  });

  it("retains every parsed Showcase filter and fragment through the real switcher", () => {
    pathState.current = "/showcase";
    searchState.current = new URLSearchParams("q=ai&category=software");
    window.history.replaceState(null, "", "/showcase?q=ai&category=software#results");
    render(<LocaleSwitcher locale="en" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));

    expect(routerReplace).toHaveBeenCalledWith(
      "/showcase?q=ai&category=software#results",
      {locale: "zh-HK"},
    );
  });

  it("preserves the current fragment after path and query when switching locale", () => {
    searchState.current = new URLSearchParams("filter=member");
    window.history.replaceState(null, "", "/events?filter=member#schedule");
    render(<LocaleSwitcher locale="en" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));

    expect(routerReplace).toHaveBeenCalledWith(
      "/events?filter=member#schedule",
      {locale: "zh-HK"},
    );
  });

  it("preserves serialized query values when switching from English to Chinese", () => {
    searchState.current = new URLSearchParams("filter=member&filter=partner&topic=AI%20%26%20data");
    render(<LocaleSwitcher locale="en" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));

    expect(routerReplace).toHaveBeenCalledWith(
      "/events?filter=member&filter=partner&topic=AI+%26+data",
      {locale: "zh-HK"},
    );
  });

  it("does not append a bare query separator when switching from English to Chinese without search state", () => {
    searchState.current = new URLSearchParams();
    render(<LocaleSwitcher locale="en" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));

    expect(routerReplace).toHaveBeenCalledWith("/events", {locale: "zh-HK"});
  });

  it("preserves an empty-valued query parameter when switching from English to Chinese", () => {
    searchState.current = new URLSearchParams("flag=");
    render(<LocaleSwitcher locale="en" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToChineseLabel}));

    expect(routerReplace).toHaveBeenCalledWith("/events?flag=", {locale: "zh-HK"});
  });

  it("preserves serialized query values when switching from Chinese to English", () => {
    searchState.current = new URLSearchParams("tag=cloud&tag=security&q=%E7%B6%B2%E7%B5%A1");
    render(<LocaleSwitcher locale="zh-HK" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToEnglishLabel}));

    expect(routerReplace).toHaveBeenCalledWith(
      "/events?tag=cloud&tag=security&q=%E7%B6%B2%E7%B5%A1",
      {locale: "en"},
    );
  });

  it("does not append a bare query separator when switching from Chinese to English without search state", () => {
    searchState.current = new URLSearchParams();
    render(<LocaleSwitcher locale="zh-HK" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToEnglishLabel}));

    expect(routerReplace).toHaveBeenCalledWith("/events", {locale: "en"});
  });

  it("preserves an empty-valued query parameter when switching from Chinese to English", () => {
    searchState.current = new URLSearchParams("flag=");
    render(<LocaleSwitcher locale="zh-HK" {...labels} />);

    fireEvent.click(screen.getByRole("button", {name: labels.switchToEnglishLabel}));

    expect(routerReplace).toHaveBeenCalledWith("/events?flag=", {locale: "en"});
  });
  it("renders a 44px locale target in each Suspense state", () => {
    render(<LocaleSwitcher locale="en" {...labels} />);

    expect(screen.getByRole("button", {name: labels.switchToChineseLabel})).toHaveClass(
      "inline-flex", "min-h-11", "min-w-11", "items-center", "justify-center",
    );
  });
});
