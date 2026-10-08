import {render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({plans: ["startup"] as string[], statuses: ["active"] as string[], notFound: vi.fn()}));

vi.mock("next-intl/server", () => ({
  // Interpolated values are appended so a test can see which plans a message was given.
  getTranslations: vi.fn(async () => (key: string, values?: Record<string, string>) =>
    values ? `${key}|${Object.values(values).join(",")}` : key,
  ),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  notFound: () => { state.notFound(); throw new Error("NEXT_NOT_FOUND"); },
}));
// HonestEmpty's ActionLink uses the locale-aware Link, which needs an intl provider this page-level render lacks.
vi.mock("@/i18n/navigation", () => ({Link: ({href, children, ...rest}: {href: string; children: React.ReactNode}) => <a href={href} {...rest}>{children}</a>}));
vi.mock("@/lib/auth/actor", () => ({
  requireActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})), getActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})),
}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => ({
    memberships: state.plans.map((planCode, index) => ({id: `m${index}`, planCode, status: state.statuses[index]})),
    companies: [],
  })),
}));

import PortalToolPage from "@/app/[locale]/(member)/portal/tools/[key]/page";

const params = (key: string) => Promise.resolve({locale: "en", key});

describe("/portal/tools/[key]", () => {
  beforeEach(() => {
    state.plans = ["startup"];
    state.statuses = ["active"];
    state.notFound.mockClear();
    process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN = "fixture-token";
  });

  afterEach(() => {
    delete process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN;
  });

  it("frames the tool with the token from the environment", async () => {
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));
    const frame = container.querySelector("iframe");

    expect(frame).not.toBeNull();
    expect(frame!.classList.contains("portal-tool-frame")).toBe(true);
    expect(screen.getByRole("heading", {level: 1, name: "tools.contentCalendar.title"})).toBeVisible();
    expect(screen.getByRole("link", {name: "tools.back"})).toHaveAttribute("href", "/portal/tools");
    expect(frame!.getAttribute("title")).toBe("tools.contentCalendar.title");
    expect(frame!.getAttribute("referrerpolicy")).toBe("no-referrer");
    // Deliberate: the page's comment explains that a cross-origin frame is already isolated,
    // and a `sandbox` without `allow-same-origin` would give it an opaque origin and stop it
    // sending its SameSite=None; Partitioned auth cookie. Pinned so a "hardening" edit that
    // adds either attribute cannot break the tool silently.
    expect(frame!.hasAttribute("sandbox")).toBe(false);
    expect(frame!.hasAttribute("allow")).toBe(false);
    const src = new URL(frame!.getAttribute("src") ?? "");
    expect(src.origin).toBe("https://content-calendar-internal.vercel.app");
    expect(src.searchParams.get("token")).toBe("fixture-token");
  });

  it("shows the upgrade path for a plan the tool does not name, and frames nothing", async () => {
    state.plans = ["community"];
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("tools.lockedTitle")).toBeVisible();
    expect(screen.getByText("tools.includedWith|plans.startup, plans.corporate and plans.patron")).toBeVisible();
    expect(screen.getByRole("link", {name: /tools\.viewPlans/})).toHaveAttribute("href", "/membership");
  });

  it("does not disclose the shared tool token to a pending paid membership", async () => {
    state.statuses = ["pending_payment"];
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));
    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("tools.lockedTitle")).toBeVisible();
  });
  it("fails closed when the token is not configured", async () => {
    delete process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN;
    const {container} = render(await PortalToolPage({params: params("content-calendar")}));

    expect(container.querySelector("iframe")).toBeNull();
    expect(screen.getByText("tools.unavailableTitle")).toBeVisible();
  });

  it("404s an unknown tool key", async () => {
    await expect(PortalToolPage({params: params("not-a-tool")})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFound).toHaveBeenCalledOnce();
  });
});
