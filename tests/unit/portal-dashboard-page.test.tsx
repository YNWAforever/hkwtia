import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import type {DashboardCompany, DashboardMembership, DashboardViewModel} from "@/lib/portal/queries";

const state = vi.hoisted(() => ({
  dashboard: null as unknown, error: null as string | null,
  eventFailure: false, directoryFailure: false,
  events: [] as unknown[], members: [] as unknown[],
}));
const content = vi.hoisted(() => ({events: vi.fn(), directory: vi.fn()}));
vi.mock("@/lib/portal/content", () => ({
  getMemberEventPage: content.events,
  searchDirectory: content.directory,
}));

vi.mock("next-intl/server", () => ({
  // Values are echoed so ICU arguments (seat count, welcome name) are observable without a catalogue.
  getTranslations: vi.fn(async () => Object.assign((key: string, values?: Record<string, unknown>) => values ? `${key}:${JSON.stringify(values)}` : key, {raw: (key: string) => key})),
  setRequestLocale: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("@/lib/auth/actor", () => ({getActor: vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"}))}));
vi.mock("@/lib/portal/queries", () => ({
  getDashboard: vi.fn(async () => {
    if (state.error) throw new Error(state.error);
    return state.dashboard;
  }),
}));
vi.mock("@/components/portal/portal-sign-out-button", () => ({
  PortalSignOutButton: ({label}: {label: string}) => <button type="button">{label}</button>,
}));

import PortalPage from "@/app/[locale]/(member)/portal/page";

type DashboardFixture = DashboardViewModel & {primaryMembershipId: string; primaryMembership: DashboardMembership};

function company(id: string, displayName: string): DashboardCompany {
  return {id, displayName, legalName: displayName, website: null, industry: null, sizeBand: null,
    description: null, directoryVisible: false, slug: null, tags: [], taglineEn: null, taglineZhHk: null,
    descriptionZhHk: null, logoMediaId: null, publicProfileStatus: "hidden", profileRejectionReason: null,
    role: "owner", canManage: true};
}

function dashboard(overrides: Partial<DashboardFixture> = {}): DashboardFixture {
  const memberships = overrides.memberships ?? [{id: "m1", ownerUserId: "u1", companyId: null, planCode: "startup", status: overrides.primaryStatus ?? "active", seatLimit: 3, applicationId: null, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null} satisfies DashboardMembership];
  const primaryMembership = overrides.primaryMembership ?? memberships[0];
  return {
    profile: {id: "p1", displayName: "Ada", phone: null, jobTitle: null, locale: "en", onboardingState: "incomplete", directoryVisible: false, whatsappNumber: null, whatsappOptIn: false},
    memberships,
    primaryMembership,
    primaryMembershipId: primaryMembership.id,
    companies: [],
    primaryStatus: primaryMembership.status,
    onboarding: {completedSteps: 1, totalSteps: 2, nextAction: "complete-company", profileComplete: true, companyComplete: false},
    privateDataAvailable: true,
    ...overrides,
  };
}

async function render(locale = "en") {
  return renderToStaticMarkup(await PortalPage({params: Promise.resolve({locale})}));
}

describe("portal dashboard page", () => {
  beforeEach(() => {
    state.error = null;
    state.dashboard = dashboard();
    state.events = [];
    state.members = [];
    state.eventFailure = false;
    state.directoryFailure = false;
    content.events.mockReset().mockImplementation(async () => {
      if (state.eventFailure) throw new Error("DATABASE_UNAVAILABLE");
      return {items: state.events, nextCursor: null};
    });
    content.directory.mockReset().mockImplementation(async () => {
      if (state.directoryFailure) throw new Error("DATABASE_UNAVAILABLE");
      return {items: state.members, nextCursor: null};
    });
  });

  function setupComplete() {
    state.dashboard = dashboard({
      onboarding: {completedSteps: 2, totalSteps: 2, nextAction: "none", profileComplete: true, companyComplete: true},
    });
  }

  it.each(["en", "zh-HK"])("shows a real upcoming event as the first useful result after setup in %s", async (locale) => {
    setupComplete();
    state.events = [{id: "event-a", title: "Meet Hong Kong founders", description: "Learn from founders.", startsAt: "2026-11-18T10:00:00Z", venue: "Cyberport", registrationMode: "rsvp"}];
    const doc = new DOMParser().parseFromString(await render(locale), "text/html");
    const result = doc.querySelector('[aria-labelledby="first-result-title"]');
    expect(result).not.toBeNull();
    expect(result?.textContent).toContain("Meet Hong Kong founders");
    expect(result?.textContent).toContain("Cyberport");
    expect(result?.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-18T10:00:00Z");
    expect(result?.querySelector("a")?.getAttribute("href")).toBe(`${locale === "zh-HK" ? "/zh" : ""}/portal/events#event-event-a`);
    expect(content.events).toHaveBeenCalledWith(expect.objectContaining({profileId: "p1"}), {limit: 1}, undefined, locale);
    expect(content.directory).not.toHaveBeenCalled();
  });

  it("routes public ticketed events to their public checkout page", async () => {
    setupComplete();
    state.events = [{id: "event-a", slug: "public-workshop", title: "Workshop", description: "Learn",
      startsAt: "2026-11-18T10:00:00Z", venue: "Cyberport", registrationMode: "ticketed", visibility: "public", memberOnly: false}];
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    expect(doc.querySelector('[aria-labelledby="first-result-title"] a')?.getAttribute("href")).toBe("/events/public-workshop");
  });

  it("shows only the visible directory projection when there are no upcoming events", async () => {
    setupComplete();
    state.members = [{userId: "visible", displayName: "Ada Member", jobTitle: "Founder", companyDisplayName: "Public Company",
      email: "private@example.test", phone: "private-phone"}];
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    const result = doc.querySelector('[aria-labelledby="first-result-title"]');
    expect(result?.textContent).toContain("Ada Member");
    expect(result?.textContent).toContain("Public Company");
    expect(result?.innerHTML).not.toContain("private");
    expect(result?.querySelector("a")?.getAttribute("href")).toBe("/portal/directory?q=Ada+Member");
    expect(content.directory).toHaveBeenCalledWith(expect.objectContaining({profileId: "p1"}), {limit: 1, excludeSelf: true});
  });

  it.each(["pending_payment", "pending_review", "past_due"] as const)("does not read member benefits for %s membership", async (status) => {
    state.dashboard = dashboard({primaryStatus: status, onboarding: {completedSteps: 2, totalSteps: 2, nextAction: "none", profileComplete: true, companyComplete: true}});
    expect(await render()).not.toContain('aria-labelledby="first-result-title"');
    expect(content.events).not.toHaveBeenCalled();
    expect(content.directory).not.toHaveBeenCalled();
  });

  it("keeps incomplete setup ahead of benefit discovery", async () => {
    await render();
    expect(content.events).not.toHaveBeenCalled();
    expect(content.directory).not.toHaveBeenCalled();
  });

  it("distinguishes an empty first result from an event read failure", async () => {
    setupComplete();
    expect(await render()).toContain("firstResult.empty");
    state.eventFailure = true;
    content.directory.mockClear();
    const html = await render();
    expect(html).toContain("firstResult.unavailable");
    expect(html).not.toContain("firstResult.empty");
    expect(content.directory).not.toHaveBeenCalled();
  });

  afterEach(() => vi.restoreAllMocks());

  it.each([
    ["42P01", "schema_missing"], ["42501", "permission_denied"], ["08006", "db_connection"], ["unknown", "read_failed"],
  ])("records a safe %s diagnostic and a matching visible reference", async (sqlstate, code) => {
    setupComplete();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    content.events.mockRejectedValueOnce(new Error("PRIVATE_CONNECTION_TEXT", {cause: {code: sqlstate}}));
    const html = await render();
    expect(log).toHaveBeenCalledTimes(1);
    const serialized = String(log.mock.calls[0][0]);
    const diagnostic = JSON.parse(serialized);
    expect(diagnostic).toMatchObject({event: "portal_first_result_read_failed", code});
    expect(diagnostic.reference).toMatch(/^[a-f0-9-]{36}$/);
    expect(html).toContain(diagnostic.reference);
    expect(serialized).not.toContain("PRIVATE_CONNECTION_TEXT");
    expect(serialized).not.toContain("profileId");
    expect(content.directory).not.toHaveBeenCalled();
  });

  it("distinguishes a directory read failure from an empty directory", async () => {
    setupComplete();
    state.directoryFailure = true;
    const html = await render();
    expect(html).toContain("firstResult.unavailable");
    expect(html).not.toContain("firstResult.empty");
  });

  it("leads with one h1, the company next step, the glance and three benefit links", async () => {
    const html = await render();
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1>welcome:/);
    expect(html).toContain('href="/portal/company"');
    expect(html).toContain("nextStep.company.title");
    expect(html).toContain("glance.title");
    expect(html).toContain("glance.seatsValue:{&quot;count&quot;:3}");
    for (const href of ["/portal/events", "/portal/directory", "/portal/tools"]) expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain("status-card");
    expect(html).not.toContain("dashboardTitle");
  });

  it("shows the company name in the welcome band when the member has one", async () => {
    state.dashboard = dashboard({companies: [company("c1", "Acme Ltd")], memberships: [{...dashboard().memberships[0], companyId: "c1"}]});
    expect(await render()).toContain("Acme Ltd");
  });

  it("renders the selected membership's company, plan, seats and date even when other rows come first", async () => {
    const active: DashboardMembership = {...dashboard().memberships[0], id: "active", companyId: "company-active", planCode: "corporate", seatLimit: 25, billingPeriodEnd: new Date("2027-01-15T00:00:00Z")};
    const due: DashboardMembership = {...active, id: "due", companyId: "company-due", status: "past_due", planCode: "startup", seatLimit: 5, cancelAtPeriodEnd: true, billingPeriodEnd: new Date("2026-10-01T00:00:00Z")};
    state.dashboard = dashboard({memberships: [due, active], primaryMembership: active, companies: [company("company-due", "Other Company"), company("company-active", "Active Company")]});
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    expect(doc.querySelector(".portal-welcome-company")?.textContent).toBe("Active Company");
    const glance = doc.querySelector(".portal-glance")?.textContent;
    expect(glance).toContain("plans.corporate");
    expect(glance).toContain('glance.seatsValue:{"count":25}');
    expect(glance).toContain("January 15, 2027");
    expect(glance).not.toContain("glance.ends");
    expect(doc.querySelector(".portal-glance a")?.getAttribute("href")).toBe("/portal/company/seats?companyId=company-active");
  });

  it("does not link a personal membership's seat summary to an unrelated company", async () => {
    state.dashboard = dashboard({companies: [company("other", "Other Company")]});
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    expect(doc.querySelector(".portal-glance a")).toBeNull();
  });

  it("shows every payment or review issue and the matching companies with one urgent billing action", async () => {
    const active = dashboard().memberships[0];
    const due: DashboardMembership = {...active, id: "due", companyId: "company-due", status: "past_due"};
    const pending: DashboardMembership = {...active, id: "pending", companyId: "company-pending", status: "pending_payment"};
    const review: DashboardMembership = {...active, id: "review", companyId: "company-review", status: "pending_review"};
    state.dashboard = dashboard({memberships: [active, review, pending, due], companies: [company("company-review", "Review Company"), company("company-due", "Due Company"), company("company-pending", "Pending Company")]});
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    const step = doc.querySelector(".portal-next-step");
    expect(step?.querySelector("h2")?.textContent).toBe("nextStep.past_due.title");
    expect(step?.textContent).toContain("Due Company");
    expect(step?.textContent).toContain("Pending Company");
    expect(step?.textContent).toContain("Review Company");
    expect(step?.querySelectorAll('a[href="/portal/billing"]')).toHaveLength(1);
    expect(step?.querySelectorAll("li")).toHaveLength(2);
  });

  it("makes an application under review actionable without exposing application internals", async () => {
    state.dashboard = dashboard({
      primaryStatus: "pending_review",
      onboarding: {completedSteps: 2, totalSteps: 2, nextAction: "none", profileComplete: true, companyComplete: true},
    });
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    const step = doc.querySelector(".portal-next-step");
    expect(step?.textContent).toContain("nextStep.pending_review.title");
    expect(step?.querySelector('a[href="/portal/applications"]')?.textContent).toContain("nextStep.pending_review.action");
    expect(step?.textContent).not.toContain("staff");
    expect(step?.textContent).not.toContain("audit");
  });

  it("omits unknown company and renewal date instead of borrowing them from another membership", async () => {
    const active = {...dashboard().memberships[0], id: "active", companyId: "not-returned"};
    state.dashboard = dashboard({memberships: [{...active, id: "other", billingPeriodEnd: new Date("2027-01-15T00:00:00Z")}, active], primaryMembership: active, companies: [company("unrelated", "Unrelated Company")]});
    const doc = new DOMParser().parseFromString(await render(), "text/html");
    expect(doc.querySelector(".portal-welcome-company")).toBeNull();
    expect(doc.querySelector(".portal-glance")?.textContent).not.toContain("2027");
  });

  it("routes a past_due member to billing and hides the onboarding step", async () => {
    state.dashboard = dashboard({primaryStatus: "past_due"});
    const html = await render();
    expect(html).toContain('href="/portal/billing"');
    expect(html).toContain("nextStep.past_due.title");
    expect(html).not.toContain("nextStep.company.title");
    expect(html).not.toContain("portal-steps");
  });

  it("shows onboarding progress only on the onboarding step", async () => {
    const html = await render();
    expect(html).toContain("portal-steps");
    expect(html).toContain("onboardingProgress:{&quot;completed&quot;:1,&quot;total&quot;:2}");
  });

  it("renders an inner-honest block, sign-out and membership link when the membership is inactive", async () => {
    state.error = "MEMBERSHIP_INACTIVE";
    const html = await render();
    expect(html).toContain("inner-honest");
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="sr-only">dashboard<\/h1>/);
    expect(html).toContain("membershipUnavailableTitle");
    expect(html).toContain("signOut");
    expect(html).toContain('href="/membership"');
    expect(html).toContain('href="/portal/applications"');
  });
});
