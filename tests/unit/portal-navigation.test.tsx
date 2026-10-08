/* eslint-disable @next/next/no-html-link-for-pages -- mocked Link stubs render plain anchors */
import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({pathname: "/portal/company/listing"}));
vi.mock("next/navigation", () => ({usePathname: () => state.pathname}));
// jsdom cannot navigate; the click must still reach the component's onClick, so this stub only
// swallows the default action.
vi.mock("@/components/internal-shell/private-link", () => ({
  PrivateLink: ({onClick, href, children, ...rest}: {onClick?: () => void; href: string; children: ReactNode}) => (
    <a href={href} {...rest} onClick={(event) => {event.preventDefault(); onClick?.();}}>{children}</a>
  ),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, children, ...rest}: {href: string; children: ReactNode}) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock("@/components/layout/locale-switcher", () => ({LocaleSwitcher: () => <button type="button">中文</button>}));
vi.mock("@/components/portal/portal-sign-out-button", () => ({
  PortalSignOutButton: () => <button type="button">Sign out</button>,
}));
vi.mock("@/components/layout/dual-brand-lockup", () => ({DualBrandLockup: () => <a href="/">Brand</a>}));

import {PortalNavigation, type PortalNavGroup} from "@/components/portal/portal-navigation";
import {PortalShell} from "@/components/portal/portal-shell";

const link = (id: string, href: string, label: string) => ({id, href, label});
const groups: readonly PortalNavGroup[] = [
  {id: "me", label: "Me", links: [link("dashboard", "/portal", "Dashboard"), link("profile", "/portal/profile", "My profile")]},
  {
    id: "company",
    label: "My company",
    links: [
      link("company", "/portal/company", "Company"),
      link("showcase-listing", "/portal/company/listing", "Showcase listing"),
      link("seats", "/portal/company/seats", "Seats"),
      link("billing", "/portal/billing", "Billing"),
    ],
  },
  {
    id: "benefits",
    label: "Membership benefits",
    links: [
      link("directory", "/portal/directory", "Directory"),
      link("events", "/portal/events", "Events"),
      link("documents", "/portal/documents", "Documents"),
      link("tools", "/portal/tools", "Tools"),
    ],
  },
];
const labels = {navigationLabel: "Member portal navigation", openMenu: "Open menu", closeMenu: "Close menu"};

describe("PortalNavigation", () => {
  it("renders the three groups in order with their own labels and ten links", () => {
    render(<PortalNavigation groups={groups} labels={labels} />);
    const nav = screen.getByRole("navigation", {name: "Member portal navigation"});
    const names = within(nav)
      .getAllByRole("list")
      .map((list) => document.getElementById(list.getAttribute("aria-labelledby") ?? "")?.textContent);
    expect(names).toEqual(["Me", "My company", "Membership benefits"]);
    expect(within(nav).getAllByRole("link")).toHaveLength(10);
  });

  it("marks Showcase listing current, not Dashboard, at /portal/company/listing", () => {
    state.pathname = "/portal/company/listing";
    render(<PortalNavigation groups={groups} labels={labels} />);
    expect(screen.getByRole("link", {name: "Showcase listing"})).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", {name: "Dashboard"})).not.toHaveAttribute("aria-current");
  });

  it("marks Seats current, not Company, at /portal/company/seats", () => {
    state.pathname = "/portal/company/seats";
    render(<PortalNavigation groups={groups} labels={labels} />);
    expect(screen.getByRole("link", {name: "Seats"})).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", {name: "Company"})).not.toHaveAttribute("aria-current");
  });

  it("opens the phone menu as a dialog, closes on Escape and returns focus to the button", async () => {
    render(<PortalNavigation groups={groups} labels={labels} />);
    const button = screen.getByRole("button", {name: "Open menu"});
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("link")).toHaveLength(10);
    fireEvent.keyDown(dialog, {key: "Escape"});
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(button).toHaveFocus());
  });

  it("closes the phone menu when a link inside it is chosen", async () => {
    render(<PortalNavigation groups={groups} labels={labels} />);
    fireEvent.click(screen.getByRole("button", {name: "Open menu"}));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("link", {name: "Events"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});

describe("PortalShell", () => {
  it("owns one main landmark and one skip link, with the portal chrome", () => {
    const {container} = render(
      <PortalShell
        locale="en"
        skipLabel="Skip to content"
        brand={{homeLabel: "Home", publicName: "WTIA", descriptor: "d", logoAlt: "logo"}}
        labels={{portalLabel: "Member portal", backToSite: "Back to public site", signOut: "Sign out", signOutError: "err", switcher: {english: "EN", chinese: "中文", switchToEnglish: "Switch to English", switchToChinese: "Switch to Chinese"}}}
        navigation={<nav aria-label="n">nav</nav>}
      >
        <p>Page</p>
      </PortalShell>,
    );
    expect(container.querySelectorAll("main#main-content")).toHaveLength(1);
    const skip = screen.getAllByRole("link", {name: "Skip to content"});
    expect(skip).toHaveLength(1);
    expect(skip[0]).toHaveAttribute("href", "#main-content");
    expect(screen.getByText("Member portal")).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Back to public site"})).toHaveAttribute("href", "/");
    expect(screen.getAllByRole("button", {name: "Sign out"})).toHaveLength(1);
  });
});
