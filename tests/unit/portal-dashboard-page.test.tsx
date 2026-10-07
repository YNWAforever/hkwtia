import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {DashboardViewModel} from "@/lib/portal/queries";

const state = vi.hoisted(() => ({dashboard: null as unknown, error: null as string | null}));

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

function dashboard(overrides: Partial<DashboardViewModel> = {}): DashboardViewModel {
  return {
    profile: {id: "p1", displayName: "Ada", phone: null, jobTitle: null, locale: "en", onboardingState: "incomplete", directoryVisible: false, whatsappNumber: null, whatsappOptIn: false},
    memberships: [{id: "m1", ownerUserId: "u1", companyId: null, planCode: "startup", status: "active", seatLimit: 3, applicationId: null, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null}],
    companies: [],
    primaryStatus: "active",
    onboarding: {completedSteps: 1, totalSteps: 2, nextAction: "complete-company", profileComplete: true, companyComplete: false},
    privateDataAvailable: true,
    ...overrides,
  } as DashboardViewModel;
}

async function render() {
  return renderToStaticMarkup(await PortalPage({params: Promise.resolve({locale: "en"})}));
}

describe("portal dashboard page", () => {
  beforeEach(() => { state.error = null; state.dashboard = dashboard(); });

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
    state.dashboard = dashboard({companies: [{displayName: "Acme Ltd"}] as unknown as DashboardViewModel["companies"]});
    expect(await render()).toContain("Acme Ltd");
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
  });
});
