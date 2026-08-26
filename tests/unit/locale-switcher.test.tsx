import {fireEvent, render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {LocaleSwitcher} from "@/components/layout/locale-switcher";

const {routerReplace, searchState} = vi.hoisted(() => ({
  routerReplace: vi.fn(),
  searchState: {current: new URLSearchParams()},
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
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
    routerReplace.mockReset();
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
});
