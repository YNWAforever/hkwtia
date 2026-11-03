import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({plans: ["community"] as string[], statuses: ["active"] as string[]}));

vi.mock("next-intl/server", () => ({
  // Interpolated values are appended so a test can see which plans a message was given.
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) =>
    values ? `${key}|${Object.values(values).join(",")}` : key,
  ),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})), getActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
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
describe("/portal/tools", () => {
  beforeEach(() => {
    state.plans = ["community"];
    state.statuses = ["active"];
  });

  it("renders the tools heading", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));

    expect(screen.getByRole("heading", {level: 1, name: "tools.title"})).toBeVisible();
  });

  it("does not link to an internal member tool", async () => {
    render(await PortalToolsPage({params: Promise.resolve({locale: "en"})}));
    expect(screen.queryByRole("heading", {level: 2})).toBeNull();
    expect(screen.queryByRole("link", {name: "tools.open"})).toBeNull();
  });
});
