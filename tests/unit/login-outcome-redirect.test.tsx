import {isValidElement, type ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({link: vi.fn(), destination: ""}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({
  redirect: (destination: string) => {state.destination = destination; throw new Error("NEXT_REDIRECT");},
}));
vi.mock("@/lib/auth/login-resolution-server", () => ({resolveCurrentLogin: async () => ({kind: "signed-out"})}));
vi.mock("@/app/[locale]/member-login/actions", () => ({
  requestMemberLoginLink: state.link, requestAdminLoginLink: state.link,
}));
vi.mock("@/app/[locale]/member-login/provision-action", () => ({provisionMemberProfileAction: vi.fn()}));
vi.mock("@/lib/auth/client", () => ({authClient: {signIn: {social: vi.fn()}}}));
vi.mock("@/i18n/navigation", () => ({Link: vi.fn(), useRouter: vi.fn(), usePathname: vi.fn(), getPathname: vi.fn()}));

import MemberLoginPage from "@/app/[locale]/member-login/page";
import AdminLoginPage from "@/app/[locale]/admin-login/page";
import {SignInForm} from "@/components/auth/sign-in-form";

type Action = (formData: FormData) => Promise<void>;
function findAction(node: ReactNode): Action | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const action = findAction(child);
      if (action) return action;
    }
  }
  if (!isValidElement<{children?: ReactNode; action?: Action}>(node)) return undefined;
  return node.type === SignInForm ? node.props.action : findAction(node.props.children);
}

describe.each([
  ["member", MemberLoginPage, "/portal/applications"],
  ["admin", AdminLoginPage, "/admin/members"],
] as const)("%s login outcome redirect", (intent, Page, destination) => {
  beforeEach(() => {state.link.mockReset(); state.destination = "";});

  it.each([
    {result: {ok: true}, wait: 60},
    {result: {ok: false, error: "rate_limited", retryAfterSeconds: 120}, wait: 120},
    {result: {ok: false, error: "rate_limited"}, wait: 300},
    {result: {ok: false, error: "rate_limited", retryAfterSeconds: 7200}, wait: 3600},
    {result: {ok: false, error: "provider_error"}, wait: null},
    {result: {ok: false, error: "invalid_email"}, wait: null},
  ])("anchors only the applicable outcome ($result)", async ({result, wait}) => {
    state.link.mockResolvedValueOnce(result);
    const page = await Page({params: Promise.resolve({locale: "zh-HK"}), searchParams: Promise.resolve({next: destination})});
    const action = findAction(page);
    expect(action).toBeTypeOf("function");
    const formData = new FormData();
    formData.set("email", "offline@example.test");
    const before = Date.now();
    await expect(action!(formData)).rejects.toThrow("NEXT_REDIRECT");
    const after = Date.now();
    expect(state.link).toHaveBeenCalledTimes(1);
    expect(state.link).toHaveBeenCalledWith({email: "offline@example.test", next: destination}, "zh-HK");
    const url = new URL(state.destination, "https://offline.example.test");
    expect(url.pathname).toBe(`/zh/${intent}-login`);
    expect(url.searchParams.get("next")).toBe(destination);
    expect(url.search).not.toContain("offline%40example.test");
    if (wait === null) {
      expect(url.searchParams.has("until")).toBe(false);
    } else {
      expect(Number(url.searchParams.get("until"))).toBeGreaterThanOrEqual(before + wait * 1000);
      expect(Number(url.searchParams.get("until"))).toBeLessThanOrEqual(after + wait * 1000);
    }
  });
});
