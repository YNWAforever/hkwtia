import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import type {DashboardMembership, DashboardViewModel} from "@/lib/portal/queries";
import type {PortalRecoveryState} from "@/lib/portal/access-state";

const state = vi.hoisted(() => ({status: "inactive" as PortalRecoveryState["status"], failure: false}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => ({kind: "member", userId: "auth", profileId: "profile"}), requireActor: vi.fn()}));
vi.mock("@/lib/auth/server", () => ({auth: {}}));
vi.mock("@/components/portal/portal-sign-out-button", () => ({PortalSignOutButton: ({label}: {label: string}) => <button>{label}</button>}));
vi.mock("@/components/internal-shell/private-link", () => ({PrivateLink: ({href, children, ...props}: {href: string; children: ReactNode}) => <a href={href} {...props}>{children}</a>}));
vi.mock("@/i18n/navigation", () => ({Link: ({href, children}: {href: string; children: ReactNode}) => <a href={href}>{children}</a>}));
vi.mock("@/lib/portal/content", async () => {
  const {PortalAccessDenied} = await import("@/lib/portal/access-state");
  const denied = async () => { if (state.failure) throw new Error("DATABASE_UNAVAILABLE"); throw new PortalAccessDenied({status: state.status}); };
  return {searchDirectory: denied, getDocuments: denied, getMemberEventPage: denied};
});
vi.mock("@/lib/portal/queries", async () => {
  const {PortalAccessDenied} = await import("@/lib/portal/access-state");
  return {getDashboard: async () => {
    if (state.failure) throw new Error("DATABASE_UNAVAILABLE");
    if (state.status === "inactive") throw new PortalAccessDenied({status: "inactive"});
    const membership: DashboardMembership = {id: "membership", ownerUserId: "profile", status: state.status === "needs_payment" ? "pending_payment" : "pending_review", companyId: null, planCode: "startup", seatLimit: 5, applicationId: null, cancelAtPeriodEnd: false, billingPeriodStart: null, billingPeriodEnd: null};
    return {
      profile: {id: "profile", displayName: "Member", phone: null, jobTitle: null, locale: "en", onboardingState: "complete", directoryVisible: false, whatsappNumber: null, whatsappOptIn: false},
      memberships: [membership], companies: [], primaryMembership: membership, primaryMembershipId: membership.id, primaryStatus: membership.status,
      onboarding: {completedSteps: 2, totalSteps: 2, nextAction: "none", profileComplete: true, companyComplete: true}, privateDataAvailable: true,
    } satisfies DashboardViewModel;
  }};
});

import DirectoryPage from "@/app/[locale]/(member)/portal/directory/page";
import EventsPage from "@/app/[locale]/(member)/portal/events/page";
import DocumentsPage from "@/app/[locale]/(member)/portal/documents/page";
import ToolsPage from "@/app/[locale]/(member)/portal/tools/page";
import ToolPage from "@/app/[locale]/(member)/portal/tools/[key]/page";
import CompanyPage from "@/app/[locale]/(member)/portal/company/page";
import ListingPage from "@/app/[locale]/(member)/portal/company/listing/page";
import SeatsPage from "@/app/[locale]/(member)/portal/company/seats/page";
import DashboardPage from "@/app/[locale]/(member)/portal/page";

type Page = (locale: string) => Promise<ReactNode>;
const benefits: [string, Page][] = [
  ["directory", (locale) => DirectoryPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({})})],
  ["events", (locale) => EventsPage({params: Promise.resolve({locale})})],
  ["documents", (locale) => DocumentsPage({params: Promise.resolve({locale})})],
  ["tools", (locale) => ToolsPage({params: Promise.resolve({locale})})],
  ["tool detail", (locale) => ToolPage({params: Promise.resolve({locale, key: "content-calendar"})})],
];
const companyPages: [string, Page][] = [
  ["company", (locale) => CompanyPage({params: Promise.resolve({locale})})],
  ["listing", (locale) => ListingPage({params: Promise.resolve({locale})})],
  ["seats", (locale) => SeatsPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({})})],
];

async function expectRecovery(page: Page, locale: string) {
  const result = page(locale);
  await expect(result).resolves.toBeDefined();
  const doc = new DOMParser().parseFromString(renderToStaticMarkup(await result), "text/html");
  expect(doc.querySelectorAll("h1")).toHaveLength(1);
  const prefix = locale === "zh-HK" ? "/zh" : "";
  expect(doc.querySelector(`a[href="${prefix}/portal/profile"]`)).not.toBeNull();
  expect(doc.querySelector(`a[href="${prefix}/portal/billing"]`)).not.toBeNull();
  if (state.status === "inactive") expect(doc.querySelector(`a[href="${prefix}/membership"]`)).not.toBeNull();
  else expect(doc.body.textContent).toContain(`access.${state.status}.title`);
}

describe("portal pages render recovery without opening entitlement gates", () => {
  beforeEach(() => { state.failure = false; state.status = "inactive"; });
  for (const locale of ["en", "zh-HK"]) {
    for (const status of ["needs_payment", "under_review", "inactive"] as const) {
      it.each(benefits)(`%s renders ${status} recovery in ${locale}`, async (_name, page) => {
        state.status = status;
        await expectRecovery(page, locale);
      });
    }
    it.each(companyPages)(`%s keeps inactive recovery available in ${locale}`, async (_name, page) => {
      await expectRecovery(page, locale);
    });
    it(`dashboard exposes own profile and billing recovery in ${locale}`, async () => {
      await expectRecovery((language) => DashboardPage({params: Promise.resolve({locale: language})}), locale);
    });
  }
  it.each(benefits)("%s still surfaces an unexpected read failure", async (_name, page) => {
    state.failure = true;
    await expect(page("en")).rejects.toThrow("DATABASE_UNAVAILABLE");
  });
});
