import {describe, expect, it, vi} from "vitest";

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
  it("does not publish the retired content calendar", async () => {
    await expect(PortalToolPage({params: params("content-calendar")})).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.notFound).toHaveBeenCalled();
  });
});
