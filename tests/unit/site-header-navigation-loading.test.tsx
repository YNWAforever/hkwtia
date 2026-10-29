import {act, render, screen, waitFor} from "@testing-library/react";
import type {ReactNode} from "react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const {desktop} = vi.hoisted(() => ({desktop: vi.fn()}));
vi.mock("@/components/layout/desktop-mega-navigation", () => ({
  DesktopMegaNavigation: (props: unknown) => {
    desktop(props);
    return <nav aria-label="Loaded desktop menu" />;
  },
}));
vi.mock("@/components/layout/header-shell", () => ({HeaderShell: ({children}: {children: ReactNode}) => <header>{children}</header>}));
vi.mock("@/components/layout/dual-brand-lockup", () => ({DualBrandLockup: () => null}));
vi.mock("@/components/layout/locale-switcher", () => ({LocaleSwitcher: () => null}));
vi.mock("@/components/layout/mobile-navigation", () => ({MobileNavigation: () => <button>Mobile menu</button>}));
vi.mock("@/components/marketing/whatsapp-link", () => ({WhatsAppLink: () => null}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/events",
  Link: ({href, children, ...props}: React.ComponentProps<"a">) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key}));

import {SiteHeader} from "@/components/layout/site-header";

describe("public header desktop bundle", () => {
  let matches: boolean;
  let changed: (() => void) | undefined;
  const removeListener = vi.fn();
  beforeEach(() => {
    desktop.mockClear();
    removeListener.mockClear();
    matches = false;
    changed = undefined;
    vi.stubGlobal("matchMedia", vi.fn((query: string) => {
      expect(query).toBe("(min-width: 1241px)");
      return {
        get matches() { return matches; },
        addEventListener: (_: string, listener: () => void) => { changed = listener; },
        removeEventListener: removeListener,
      };
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each(["en", "zh-HK"] as const)("keeps the desktop menu unmounted at mobile widths in %s", async (locale) => {
    render(await SiteHeader({locale}));
    // Flush effects/imports: a CSS-hidden desktop menu must do no Radix work on mobile.
    await act(async () => {});
    expect(desktop).not.toHaveBeenCalled();
    expect(screen.getByRole("button", {name: "Mobile menu"})).toBeEnabled();
    expect(screen.getByRole("link", {name: /groups.eventsProgrammes.label/}))
      .toHaveAttribute("href", locale === "en" ? "/events" : "/zh/events");
  });

  it("loads the existing menu and its props when the desktop breakpoint becomes visible", async () => {
    const view = render(await SiteHeader({locale: "en"}));
    expect(desktop).not.toHaveBeenCalled();
    matches = true;
    act(() => changed?.());
    await screen.findByRole("navigation", {name: "Loaded desktop menu"});
    expect(desktop).toHaveBeenCalledWith(expect.objectContaining({
      primaryLabel: "primaryLabel", exploreLabel: "explore", viewOverviewLabel: "viewOverview",
      groups: expect.arrayContaining([expect.objectContaining({id: "events-programmes"})]),
    }));
    view.unmount();
    expect(removeListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("loads immediately at desktop widths", async () => {
    matches = true;
    render(await SiteHeader({locale: "en"}));
    await waitFor(() => expect(desktop).toHaveBeenCalled());
  });
});
