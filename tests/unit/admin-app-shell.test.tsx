import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({path: "/zh/admin/members/123", push: vi.fn(), refresh: vi.fn(), signOut: vi.fn<() => Promise<{error: unknown}>>(async () => ({error: null}))}));
vi.mock("next/navigation", () => ({usePathname: () => state.path}));
vi.mock("next-intl", () => ({useTranslations: () => (key: string) => key}));
vi.mock("@/i18n/navigation", () => ({useRouter: () => ({push: state.push, refresh: state.refresh})}));
vi.mock("@/lib/auth/client", () => ({authClient: {signOut: state.signOut}}));
import {AdminAppShell} from "@/components/admin/admin-app-shell";

const props = {locale: "zh-HK" as const, identity: "Synthetic Staff", role: "staff" as const, skipLabel: "Skip to content"};
describe("admin workspace shell", () => {
  beforeEach(() => {state.path = "/zh/admin/members/123"; state.push.mockReset(); state.refresh.mockReset(); state.signOut.mockClear();});
  it("retains every existing destination and marks the longest matching link", () => {
    render(<AdminAppShell {...props}><h1>Member detail</h1></AdminAppShell>);
    const nav = screen.getByRole("navigation", {name: "navigation.label"});
    expect(within(nav).getAllByRole("link")).toHaveLength(23);
    expect(within(nav).getByRole("link", {name: "navigation.members"})).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", {name: "navigation.members"})).toHaveAttribute("href", "/zh/admin/members");
  });
  it("exposes search entry, site link, identity and a collapsible sidebar", () => {
    render(<AdminAppShell {...props}><h1>Member detail</h1></AdminAppShell>);
    expect(screen.getByRole("link", {name: "shell.searchMembers"})).toHaveAttribute("href", "/zh/admin/members");
    expect(screen.getByRole("link", {name: "shell.viewSite"})).toHaveAttribute("href", "/zh");
    expect(screen.getByText("Synthetic Staff")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", {name: "shell.collapseSidebar"}));
    expect(screen.getByTestId("admin-desktop-sidebar")).toHaveAttribute("data-collapsed", "true");
    expect(screen.getByRole("link", {name: "Skip to content"})).toHaveAttribute("href", "#main-content");
  });
  it("keeps the admin session in place when the provider rejects sign-out", async () => {
    state.signOut.mockResolvedValueOnce({error: {message: "provider unavailable"}});
    render(<AdminAppShell {...props}><h1>Member detail</h1></AdminAppShell>);
    fireEvent.click(screen.getByText("Synthetic Staff"));
    fireEvent.click(screen.getByRole("button", {name: "shell.signOut"}));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("shell.signOutError"));
    expect(state.push).not.toHaveBeenCalled();
  });
  it("opens a keyboard-dismissable mobile navigation drawer", async () => {
    render(<AdminAppShell {...props}><h1>Member detail</h1></AdminAppShell>);
    fireEvent.click(screen.getByRole("button", {name: "shell.menu"}));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, {key: "Escape"});
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
