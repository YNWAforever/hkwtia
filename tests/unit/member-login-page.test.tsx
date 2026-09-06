import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => Object.assign((key: string) => key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({getActor: vi.fn(async () => null)}));

import {getActor} from "@/lib/auth/actor";
import MemberLoginPage from "@/app/[locale]/member-login/page";

describe("MemberLoginPage", () => {
  it("shows the honest access message and no login form for an already-authenticated actor", async () => {
    vi.mocked(getActor).mockResolvedValueOnce({kind: "member", userId: "u1", profileId: "p1"});

    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));

    expect(screen.getByText("nonMemberAccess")).toBeInTheDocument();
    expect(screen.queryByTestId("member-login-form")).not.toBeInTheDocument();
  });

  it("renders an email field and a submit control when unauthenticated", async () => {
    render(await MemberLoginPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
    expect(screen.getByLabelText("emailLabel")).toBeInTheDocument();
    expect(screen.getByRole("button", {name: "submit"})).toBeInTheDocument();
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
