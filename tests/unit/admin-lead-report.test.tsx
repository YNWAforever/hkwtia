import {render, screen, within} from "@testing-library/react";
import type {ReactNode} from "react";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {LeadReport} from "@/lib/db/repos/lead-report";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * Phase E, Task 10. The page's contract: an unknown window means 90, a failed
 * read is "unavailable" (never a wall of zeros, which would read as "no leads"),
 * the estimate always carries its label, and window links are UNPREFIXED paths
 * for the i18n Link (round-28 rule).
 */
const state = vi.hoisted(() => ({summary: vi.fn()}));
const bundles = {en: en.Admin.reports.leads, "zh-HK": zh.Admin.reports.leads} as const;

function translator(locale: "en" | "zh-HK") {
  return (key: string, values: Readonly<Record<string, string | number>> = {}) => {
    const found = key.split(".").reduce<unknown>(
      (node, part) => typeof node === "object" && node !== null ? (node as Record<string, unknown>)[part] : undefined,
      bundles[locale],
    );
    if (typeof found !== "string") throw new Error(`missing Admin.reports.leads.${key}`);
    return found.replaceAll(/\{(\w+)\}/g, (_m, name: string) => String(values[name] ?? ""));
  };
}

vi.mock("next-intl/server", () => ({
  setRequestLocale: () => undefined,
  getTranslations: async ({locale}: {locale: "en" | "zh-HK"}) => translator(locale),
}));
vi.mock("@/lib/auth/server", () => ({getSession: async () => null}));
vi.mock("@/lib/admin/page-auth", () => ({
  requireAdminPageActor: async () => ({kind: "staff", userId: "staff-user", profileId: "staff-user"}),
}));
vi.mock("@/lib/db/repos/lead-report", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/repos/lead-report")>()),
  leadReportRepository: {summary: (...args: unknown[]) => state.summary(...args)},
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));

import AdminLeadReportPage from "@/app/[locale]/(admin)/admin/reports/leads/page";

const emptyStages = {new: 0, contacted: 0, qualified: 0, applied: 0, member: 0, closed: 0};
function report(overrides: Partial<LeadReport> = {}): LeadReport {
  const sources = ["whatsapp", "event_guest", "showcase_intro", "join_abandoned", "interest_form", "import"] as const;
  return {
    bySource: Object.fromEntries(sources.map((s) => [s, {...emptyStages}])) as LeadReport["bySource"],
    byOwner: [
      {ownerProfileId: "o1", ownerName: "Grace Staff", leads: 5, invitesSent: 3, invitesOpened: 2, applications: 1, members: 1},
      {ownerProfileId: null, ownerName: null, leads: 2, invitesSent: 0, invitesOpened: 0, applications: 0, members: 0},
    ],
    invites: {sent: 3, opened: 2, applied: 2, paid: 1, medianInviteToPaidHours: 36.5, invitedVsJoined: [{invited: "startup", joined: "corporate", count: 1}]},
    estimatedFirstYearHkd: 6200,
    ...overrides,
  };
}

async function renderPage(locale: "en" | "zh-HK", window?: string | string[]) {
  return render(await AdminLeadReportPage({
    params: Promise.resolve({locale}),
    searchParams: Promise.resolve(window === undefined ? {} : {window}),
  }));
}

beforeEach(() => { state.summary.mockReset().mockResolvedValue(report()); });

describe.each([["en", en.Admin.reports.leads], ["zh-HK", zh.Admin.reports.leads]] as const)("the lead report in %s", (locale, text) => {
  it("renders the heading, owners (named and unassigned) and invite effectiveness", async () => {
    await renderPage(locale);
    expect(screen.getByRole("heading", {level: 1, name: text.title})).toBeInTheDocument();
    expect(screen.getByText("Grace Staff")).toBeInTheDocument();
    expect(screen.getByText(text.unassigned)).toBeInTheDocument();
  });

  it("shows the estimate number beside the estimate label", async () => {
    await renderPage(locale);
    const figure = screen.getByTestId("estimated-fees");
    expect(figure).toHaveTextContent(text.estimateLabel);
    expect(figure).toHaveTextContent("6,200");
  });

  it("defaults an unknown window to 90 days", async () => {
    await renderPage(locale, "banana");
    expect(state.summary).toHaveBeenCalledWith(expect.anything(), "90");
  });

  it("passes a known window through", async () => {
    await renderPage(locale, "180");
    expect(state.summary).toHaveBeenCalledWith(expect.anything(), "180");
  });

  it("links the windows with unprefixed hrefs", async () => {
    await renderPage(locale);
    const nav = screen.getByRole("navigation", {name: text.windowLabel});
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/admin/reports/leads?window=30", "/admin/reports/leads?window=90",
      "/admin/reports/leads?window=180", "/admin/reports/leads?window=all",
    ]);
  });

  it("shows 'unavailable', not zeros, when the read fails", async () => {
    state.summary.mockRejectedValue(new Error("db down"));
    await renderPage(locale);
    expect(screen.getByRole("alert")).toHaveTextContent(text.unavailable);
    expect(screen.queryByTestId("estimated-fees")).toBeNull();
  });

  it("says 'none yet' for the median when nobody has paid", async () => {
    state.summary.mockResolvedValue(report({invites: {...report().invites, paid: 0, medianInviteToPaidHours: null}}));
    await renderPage(locale);
    expect(screen.getByTestId("median-hours")).toHaveTextContent(text.noMedian);
  });
});
