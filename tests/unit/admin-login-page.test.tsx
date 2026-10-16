import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({actor: null as null | {kind: string; userId: string; profileId: string}, failure: false, redirected: ""}));
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({redirect: (path: string) => { state.redirected = path; throw new Error("NEXT_REDIRECT"); }}));
vi.mock("@/lib/auth/login-resolution-server", () => ({resolveCurrentLogin: async ({path}: {path: string}) => {
  if (state.failure) return {kind: "unavailable", reference: "safe-ref"};
  if (!state.actor) return {kind: "signed-out"};
  if (state.actor.kind === "member") return {kind: "forbidden"};
  return {kind: "allowed", destination: {intent: "admin", path}};
}}));
vi.mock("@/components/layout/locale-switcher", () => ({LocaleSwitcher: ({switchToChineseLabel}: {switchToChineseLabel: string}) => <button aria-label={switchToChineseLabel} type="button"/>}));
vi.mock("@/components/portal/portal-sign-out-button", () => ({PortalSignOutButton: ({label}: {label: string}) => <button type="button">{label}</button>}));vi.mock("next/image", () => ({default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />}));
vi.mock("@/i18n/navigation", () => ({Link: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));

import AdminLoginPage from "@/app/[locale]/admin-login/page";

const props = (next?: string) => ({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve(next ? {next} : {})});

describe("public staff login page", () => {
  beforeEach(() => {state.actor = null; state.failure = false; state.redirected = "";});

  it("offers an email login form with a validated return path", async () => {
    render(await AdminLoginPage(props("/admin/members?q=Acme")));
    expect(screen.getByRole("heading", {name: "title"})).toBeInTheDocument();
    expect(screen.getByTestId("admin-login-form")).toHaveAttribute("data-continuation", "/admin/members?q=Acme");
  });

  it("shows a clear denial rather than a login loop for an authenticated member", async () => {
    state.actor = {kind: "member", userId: "user", profileId: "profile"};
    render(await AdminLoginPage(props()));
    expect(screen.getByRole("alert")).toHaveTextContent("accessDenied");
    expect(screen.queryByTestId("admin-login-form")).not.toBeInTheDocument();
  });

  it("offers locale and account switching after an authenticated member is denied staff access", async () => {
    state.actor = {kind: "member", userId: "user", profileId: "profile"};
    render(await AdminLoginPage(props("/admin/inbox")));
    expect(screen.getByRole("button", {name: "switchToChinese"})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "switchAccount"})).toBeInTheDocument();
  });
  it("redirects authorized staff to the allowed destination", async () => {
    state.actor = {kind: "staff", userId: "user", profileId: "profile"};
    await expect(AdminLoginPage(props("/admin/inbox"))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirected).toBe("/admin/inbox");
  });

  it("does not present an identity-store outage as signed out", async () => {
    state.failure = true;
    render(await AdminLoginPage(props()));
    expect(screen.getByRole("alert")).toHaveTextContent("identityUnavailable");
    expect(screen.queryByTestId("admin-login-form")).not.toBeInTheDocument();
  });
});
