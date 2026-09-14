import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({plans: ["community"] as string[]}));

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => ({
    memberships: state.plans.map((planCode, index) => ({id: `m${index}`, planCode})),
    companies: [],
  })),
}));

import PortalToolsPage from "@/app/[locale]/(member)/portal/tools/page";

describe("/portal/tools", () => {
  beforeEach(() => {
    state.plans = ["community"];
  });

  it("renders the tools heading", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: "tools.title"})).toBeVisible();
  });

  it("shows a locked card and the upgrade path for a Community member", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByText("tools.lockedTitle")).toBeVisible();
    expect(screen.queryByRole("link", {name: "tools.open"})).not.toBeInTheDocument();
    expect(screen.getByRole("link", {name: "tools.upgrade"})).toHaveAttribute("href", "/membership");
  });

  it("links an entitled member through to the tool", async () => {
    state.plans = ["startup"];
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("link", {name: "tools.open"})).toHaveAttribute("href", "/portal/tools/content-calendar");
    expect(screen.queryByText("tools.lockedTitle")).not.toBeInTheDocument();
  });
});
