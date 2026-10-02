import {render, screen} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

import {SiteHeader} from "@/components/layout/site-header";

vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key}));
vi.mock("@/i18n/navigation", () => ({Link: ({href, ...props}: React.AnchorHTMLAttributes<HTMLAnchorElement> & {href: string}) => <a href={href} {...props} />}));
vi.mock("@/components/layout/header-shell", () => ({HeaderShell: ({children}: {children: ReactNode}) => <header>{children}</header>}));
vi.mock("@/components/layout/dual-brand-lockup", () => ({DualBrandLockup: () => <a href="/">Brand</a>}));
vi.mock("@/components/layout/locale-switcher", () => ({LocaleSwitcher: () => <button>Locale</button>}));
vi.mock("@/components/marketing/whatsapp-link", () => ({WhatsAppLink: () => <a href="https://example.test">Chat</a>}));
vi.mock("@/components/layout/desktop-mega-navigation", () => ({DesktopMegaNavigation: () => <nav><a href="/events">Events</a></nav>}));
vi.mock("@/components/layout/mobile-navigation", () => ({MobileNavigation: () => <button>Menu</button>}));

describe("streamed header focus boundary", () => {
  it("removes every temporary header control from focus and accessibility until replacement", async () => {
    const {container} = render(await SiteHeader({locale: "en", navigationPending: true}));
    const inner = container.querySelector(".header-inner");
    expect(inner).toHaveAttribute("inert");
    expect(inner).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("link", {name: "actions.memberSignIn"})).not.toBeInTheDocument();
  });

  it("keeps the stable header controls available", async () => {
    const {container} = render(await SiteHeader({locale: "en"}));
    const inner = container.querySelector(".header-inner");
    expect(inner).not.toHaveAttribute("inert");
    expect(inner).not.toHaveAttribute("aria-hidden");
    expect(screen.getByRole("link", {name: "actions.memberSignIn"})).toHaveAttribute("href", "/member-login");
  });
});
