import {render, screen, within} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import {MEMBER_TOOLS} from "@/config/member-tools";

const state = vi.hoisted(() => ({plans: ["community"] as string[], statuses: ["active"] as string[]}));

vi.mock("next-intl/server", () => ({
  // Interpolated values are appended so a test can see which plans a message was given.
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) =>
    values ? `${key}|${Object.values(values).join(",")}` : key,
  ),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => ({
    memberships: state.plans.map((planCode, index) => ({id: `m${index}`, planCode, status: state.statuses[index]})),
    companies: [],
  })),
}));

import PortalToolsPage from "@/app/[locale]/(member)/portal/tools/page";

// The registry is built for N tools, so queries are scoped to one card rather than the whole
// page: a singular `getByText`/`getByRole` would throw the moment a second tool is added.
const tool = MEMBER_TOOLS[0];

function toolCard(): HTMLElement {
  const card = screen
    .getByRole("heading", {level: 2, name: tool.titleKey})
    .closest("li");
  if (!card) throw new Error(`No card rendered for ${tool.key}`);
  return card as HTMLElement;
}

describe("/portal/tools", () => {
  beforeEach(() => {
    state.plans = ["community"];
    state.statuses = ["active"];
  });

  it("renders the tools heading", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: "tools.title"})).toBeVisible();
  });

  it("shows a locked card naming the plans, with a path to membership", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    const card = within(toolCard());
    expect(card.getByText(`tools.includedWith|plans.startup, plans.corporate and plans.patron`)).toBeVisible();
    expect(card.queryByRole("link", {name: "tools.open"})).not.toBeInTheDocument();
    expect(card.getByRole("link", {name: "tools.viewPlans"})).toHaveAttribute("href", "/membership");
  });

  it("keeps a pending paid plan locked even when an active Community plan exists", async () => {
    state.plans = ["corporate", "community"];
    state.statuses = ["pending_payment", "active"];
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));
    const card = within(toolCard());
    expect(card.queryByRole("link", {name: "tools.open"})).not.toBeInTheDocument();
    expect(card.getByText(/^tools\.includedWith/)).toBeVisible();
  });
  it("links an entitled member through to the tool", async () => {
    state.plans = ["startup"];
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    const card = within(toolCard());
    expect(card.getByRole("link", {name: "tools.open"})).toHaveAttribute("href", `/portal/tools/${tool.key}`);
    expect(card.queryByText(/^tools\.includedWith/)).not.toBeInTheDocument();
    expect(card.getByText(tool.descriptionKey)).toBeVisible();
    expect(card.getAllByRole("link")).toHaveLength(1);
    expect(card.getByRole("link", {name: "tools.open"})).toHaveClass("button");
  });
});
