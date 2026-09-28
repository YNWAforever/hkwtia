import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({redirectUrl: null as string | null, resolution: {kind: "signed-out"} as {kind: string; destination?: {intent: "member"; path: string}}}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string, params?: {reference?: string}) => key + (params?.reference ?? ""), {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
}));
vi.mock("@/lib/auth/login-resolution-server", () => ({resolveCurrentLogin: vi.fn(async () => state.resolution)}));

vi.mock("next/image", () => ({default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />}));
vi.mock("@/i18n/navigation", () => ({Link: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>}));

import MemberLoginPage from "@/app/[locale]/member-login/page";

describe("MemberLoginPage", () => {
  beforeEach(() => {
    state.redirectUrl = null;
    state.resolution = {kind: "signed-out"};
  });

  // Regression: clicking the magic-link email landed an authenticated actor
  // back on this page with a dead-end "already signed in" message and no
  // way forward. Mirrors /join's page.tsx, which already redirects.
  it("redirects an already-authenticated actor to the continuation instead of showing a login form", async () => {
    state.resolution = {kind: "allowed", destination: {intent: "member", path: "/portal/billing"}};

    await expect(
      MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({next: "/portal/billing"})}),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(state.redirectUrl).toBe("/portal/billing");
  });

  it("does not forward a staff role into the member portal", async () => {
    state.resolution = {kind: "forbidden"};
    render(await MemberLoginPage({params: Promise.resolve({locale: "zh-HK"}), searchParams: Promise.resolve({})}));
    expect(screen.getByRole("alert")).toHaveTextContent("memberAccessDenied");
    expect(screen.queryByTestId("member-login-form")).not.toBeInTheDocument();
  });

  it("renders an email field and a submit control when unauthenticated", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
    expect(screen.getByLabelText("emailLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "submit"})).toBeInTheDocument();
  });

  it("renders a compact branded shell with home, join and support paths", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("img", {name: "logoAlt"})).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "home"})).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", {name: "join"})).toHaveAttribute("href", "/join");
    expect(screen.getByRole("link", {name: "staffSignIn"})).toHaveAttribute("href", "/admin-login");
    expect(screen.getByRole("link", {name: "support"})).toHaveAttribute("href", expect.stringMatching(/^mailto:/));
  });

  it("keeps the send form available after an email is sent so the visitor can request another link", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({sent: "1", next: "/portal/billing"})}));
    expect(screen.getByTestId("member-login-form")).toHaveAttribute("data-continuation", "/portal/billing");
    expect(screen.getByRole("button", {name: "resend"})).toBeInTheDocument();
  });

  it("shows the bounded support reference after profile creation fails", async () => {
    state.resolution = {kind: "needs-profile"};
    const reference = "11111111-1111-4111-8111-111111111111";
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({profile: "unavailable", reference})}));
    expect(screen.getByRole("alert")).toHaveTextContent(reference);
  });
  it("does not reflect an untrusted reference into the profile error", async () => {
    state.resolution = {kind: "needs-profile"};
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({profile: "unavailable", reference: "private-token<script>"})}));
    expect(screen.getByRole("alert")).not.toHaveTextContent("private-token");
    expect(screen.getByRole("alert")).not.toHaveTextContent("profileReference");
  });
  it("fails open to the default target when next fails the continuation parser", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({next: "/admin"})}));
    const form = screen.getByTestId("member-login-form");
    expect(form).toHaveAttribute("data-continuation", "/portal");
  });

  it("preserves a valid continuation", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({next: "/portal/billing"})}));
    const form = screen.getByTestId("member-login-form");
    expect(form).toHaveAttribute("data-continuation", "/portal/billing");
  });
});
