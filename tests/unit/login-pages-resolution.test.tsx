import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({resolution: {kind: "signed-out"} as {kind: string; reference?: string; intent?: string}}));
vi.mock("@/lib/auth/login-resolution-server", () => ({resolveCurrentLogin: async () => state.resolution}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => null}));
vi.mock("@/app/[locale]/member-login/provision-action", () => ({provisionMemberProfileAction: async () => undefined}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string, params?: {reference?: string}) => params?.reference ? key + params.reference : key, setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({redirect: () => {throw new Error("NEXT_REDIRECT");}, useSearchParams: () => new URLSearchParams()}));
vi.mock("next/image", () => ({default: ({alt, src, ...props}: {alt: string; src: string}) => <img alt={alt} src={src} {...props} />}));
vi.mock("@/i18n/navigation", () => ({Link: ({children, href, ...props}: {children: React.ReactNode; href: string}) => <a href={href} {...props}>{children}</a>, usePathname: () => "/member-login", useRouter: () => ({replace: vi.fn()})}));
import MemberLoginPage from "@/app/[locale]/member-login/page";
import AdminLoginPage from "@/app/[locale]/admin-login/page";
const props = {params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})};

describe("login page recovery states", () => {
  beforeEach(() => {state.resolution = {kind: "signed-out"};});
  it("offers least-privileged profile onboarding after a valid provider session", async () => {
    state.resolution = {kind: "needs-profile", intent: "member"};
    render(await MemberLoginPage(props));
    expect(screen.getByTestId("profile-provision-form")).toBeInTheDocument();
    expect(screen.queryByTestId("member-login-form")).not.toBeInTheDocument();
  });
  it("requires staff support for an unlinked staff intent instead of granting a role", async () => {
    state.resolution = {kind: "needs-profile", intent: "admin"};
    render(await AdminLoginPage(props));
    expect(screen.getByRole("alert")).toHaveTextContent("profileRecovery");
    expect(screen.queryByTestId("admin-login-form")).not.toBeInTheDocument();
  });
  it("shows a safe reference and retry for an identity outage", async () => {
    state.resolution = {kind: "unavailable", reference: "safe-ref"};
    render(await MemberLoginPage(props));
    expect(screen.getByRole("alert")).toHaveTextContent("safe-ref");
    expect(screen.queryByTestId("member-login-form")).not.toBeInTheDocument();
  });
});
