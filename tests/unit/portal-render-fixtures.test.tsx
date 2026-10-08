/* eslint-disable @next/next/no-img-element -- next/image is stubbed with a plain img so the static fixture carries the logo inline */
/**
 * Fixture writer for tests/e2e/portal-experience.spec.ts. RUN THIS FIRST:
 *
 *   npx vitest run tests/unit/portal-render-fixtures.test.tsx
 *   PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/portal-experience.spec.ts --project=chromium
 *
 * Playwright cannot mock modules, and the portal pages read the session, the database and
 * next-intl's request scope. So the pages are rendered here, through the real portal layout
 * (PortalShell + PortalNavigation), against a mocked actor, mocked portal reads and the real
 * English catalogue, and each result is written as a standalone HTML document to
 * .tmp/portal-fixtures/ (git-ignored). Not test-results/: Playwright empties its output
 * directory at the start of every run, which would delete the fixtures before the spec read them.
 * The e2e spec then loads each file with the real stylesheets and measures it.
 */
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";

import {fireEvent, render, waitFor} from "@testing-library/react";
import {isValidElement, type ReactElement, type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

import type {DashboardCompany, DashboardViewModel} from "@/lib/portal/queries";

// `locale` drives both catalogues: the -zh form fixtures render the same pages with zh-HK copy to
// check bilingual pairing and Chinese wrapping. `seatLimit` lets the seats page render with room or full.
// `overrides` swaps one read's result for a single fixture (events, directory, documents, billing);
// beforeEach clears it, so every other fixture keeps the default reads below.
const state = vi.hoisted(() => ({pathname: "/portal", dashboard: null as unknown, locale: "en" as "en" | "zh-HK", seatLimit: 3, overrides: {} as Record<string, unknown>}));

vi.mock("next-intl/server", async () => {
  const {createTranslator} = await import("next-intl");
  const {default: en} = await import("@/messages/en.json");
  const {default: zhHK} = await import("@/messages/zh-HK.json");
  const catalogue = (locale: string) => (locale === "zh-HK" ? zhHK : en) as typeof en;
  return {
    getTranslations: vi.fn(async (options?: string | {locale?: string; namespace?: string}) => {
      const {locale = state.locale, namespace} = typeof options === "string" ? {namespace: options} : options ?? {};
      return createTranslator({locale, messages: catalogue(locale), namespace: namespace as never});
    }),
    getMessages: vi.fn(async (options?: {locale?: string}) => catalogue(options?.locale ?? state.locale)),
    setRequestLocale: vi.fn(),
  };
});
// Outside a Next request the provider cannot infer the locale from the request config.
vi.mock("next-intl", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next-intl")>();
  const Provider = actual.NextIntlClientProvider;
  return {...actual, NextIntlClientProvider: (props: Parameters<typeof Provider>[0]) => <Provider locale={state.locale} timeZone="Asia/Hong_Kong" {...props} />};
});
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  redirect: (url: string) => { throw new Error(`NEXT_REDIRECT ${url}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  usePathname: () => state.pathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
// The logo is inlined as a data URI: the fixture is loaded with page.setContent, which has no
// origin to resolve /images/wtia-logo.png against.
vi.mock("next/image", async () => {
  const {readFileSync} = await import("node:fs");
  const logo = `data:image/png;base64,${readFileSync(resolve(process.cwd(), "public/images/wtia-logo.png")).toString("base64")}`;
  return {
    default: ({alt, width, height, className}: {alt: string; width?: number; height?: number; className?: string}) => (
      <img alt={alt} className={className} height={height} src={logo} width={width} />
    ),
  };
});
vi.mock("@/i18n/navigation", () => ({
  Link: ({href, children, ...rest}: {href: string; children: ReactNode}) => <a href={href} {...rest}>{children}</a>,
  usePathname: () => state.pathname,
  useRouter: () => ({push: vi.fn(), replace: vi.fn(), refresh: vi.fn()}),
  getPathname: ({href}: {href: string}) => href,
}));
// next/link needs the app router's context; the anchor it would emit is all the fixture needs.
vi.mock("@/components/internal-shell/private-link", () => ({
  PrivateLink: ({href, children, onClick, ...rest}: {href: string; children: ReactNode; onClick?: () => void}) => (
    <a href={href} {...rest} onClick={(event) => { event.preventDefault(); onClick?.(); }}>{children}</a>
  ),
}));
// A floating client widget with its own network calls; it is not part of the frame under test.
vi.mock("@/components/ai/concierge-widget", () => ({ConciergeWidget: () => null}));
vi.mock("@/lib/auth/client", () => ({authClient: {signOut: vi.fn()}}));
vi.mock("@/lib/auth/server", () => ({auth: {}}));
vi.mock("@/lib/auth/actor", () => {
  const actor = {kind: "member", userId: "u1", profileId: "p1"};
  return {getActor: vi.fn(async () => actor), requireActor: vi.fn(async () => actor)};
});

// ─── Reads, all fixed: a company, two seats, two events, one document, one tool ──────────
const company = {
  id: "c1", legalName: "Harbour Robotics Limited", displayName: "Harbour Robotics", website: "https://harbour-robotics.example.hk",
  industry: "Robotics", sizeBand: "11–50", description: "Warehouse automation for Hong Kong's logistics operators.", directoryVisible: true,
  slug: "harbour-robotics", tags: ["ai"], taglineEn: "Warehouse robots that work with your team", taglineZhHk: "與團隊協作的倉庫機械人",
  descriptionZhHk: "為香港物流營運商提供倉庫自動化方案。", logoMediaId: null, publicProfileStatus: "published", profileRejectionReason: null,
  role: "owner", canManage: true,
} as unknown as DashboardCompany;

function dashboard(overrides: Partial<DashboardViewModel> & {status?: string} = {}): DashboardViewModel {
  const {status = "active", ...rest} = overrides;
  return {
    profile: {id: "p1", displayName: "Ada Chan", phone: "+852 5123 4567", jobTitle: "Chief Executive", locale: "en", onboardingState: "complete", directoryVisible: true, whatsappNumber: null, whatsappOptIn: false},
    memberships: [{id: "m1", ownerUserId: "u1", companyId: "c1", planCode: "startup", status, seatLimit: 3, applicationId: null, cancelAtPeriodEnd: false, billingPeriodStart: new Date("2026-04-01T00:00:00.000Z"), billingPeriodEnd: new Date("2027-03-31T00:00:00.000Z")}],
    companies: [company],
    primaryStatus: status,
    onboarding: {completedSteps: 2, totalSteps: 2, nextAction: "none", profileComplete: true, companyComplete: true},
    privateDataAvailable: true,
    ...rest,
  } as DashboardViewModel;
}

vi.mock("@/lib/portal/queries", () => ({getDashboard: vi.fn(async () => state.dashboard)}));
vi.mock("@/lib/portal/billing-summary", () => ({
  getBillingSummary: vi.fn(async () => state.overrides.billing ?? ({
    membershipId: "m1", status: "active", canManageBilling: true, recovery: "resume", subscriptionRef: "sub_fixture",
    memberships: [{id: "m1", planCode: "startup", status: "active", companyId: "c1", canManageBilling: true, recovery: "resume", subscriptionRef: "sub_fixture", canViewHistory: true, providerAvailable: true}],
  })),
}));
vi.mock("@/lib/billing/checkout-service", () => ({createBillingPortalSession: vi.fn(), createCheckoutSession: vi.fn()}));
vi.mock("@/lib/membership/policy", () => ({policyAcceptanceEnabled: () => false}));
vi.mock("@/lib/db/repos/memberships", () => ({membershipsRepository: {}}));
vi.mock("@/lib/db/repos/showcase", () => ({
  showcaseRepository: {
    getByCompany: vi.fn(async () => ({
      status: "draft", slug: "harbour-picker", nameEn: "Harbour Picker", nameZhHk: "海港揀貨機械人", taglineEn: "Autonomous picking for small warehouses",
      taglineZhHk: "小型倉庫的自主揀貨方案", descriptionEn: "A picking robot that fits existing shelving.", descriptionZhHk: "適用於現有貨架的揀貨機械人。",
      category: "Robotics", useCases: ["Logistics", "Retail"], deploymentOptions: ["On-premise"], supportedLanguages: ["English", "Cantonese"],
      worksWith: ["SAP"], videoUrl: "", caseStudyUrl: "", caseStudySummaryEn: "", caseStudySummaryZhHk: "", logoReference: "",
    })),
  },
}));
vi.mock("@/lib/showcase/member-actions", () => ({saveShowcaseDraftAction: vi.fn(), submitShowcaseListingAction: vi.fn()}));
vi.mock("@/lib/portal/company-profile-actions", () => ({saveCompanyProfileAction: vi.fn()}));
vi.mock("@/lib/portal/commands", () => ({updateCompanyAction: vi.fn(), updateProfileAction: vi.fn()}));
vi.mock("@/lib/db/repos/seats", () => ({
  SeatServiceError: class SeatServiceError extends Error { constructor(public code: string) { super(code); } },
  acceptSeatInvitation: vi.fn(), changeSeatRole: vi.fn(), inviteSeat: vi.fn(), revokeInvitation: vi.fn(), revokeSeat: vi.fn(),
}));
vi.mock("@/lib/portal/seats", () => ({
  getSeatOverview: vi.fn(async () => ({
    companyId: "c1", seatLimit: state.seatLimit, canManage: true, canGrantOwner: true,
    members: [{id: "cm1", companyId: "c1", userId: "ada.chan@harbour-robotics.example.hk", role: "owner"}, {id: "cm2", companyId: "c1", userId: "ben.wong@harbour-robotics.example.hk", role: "admin"}],
    invitations: [{id: "inv1", companyId: "c1", invitedEmail: "carmen.lee@harbour-robotics.example.hk", role: "member"}],
  })),
}));
vi.mock("@/lib/portal/content", () => ({
  searchDirectory: vi.fn(async () => state.overrides.directory ?? ({
    items: [
      {userId: "u1", displayName: "Ada Chan", jobTitle: "Chief Executive", companyId: "c1", companyDisplayName: "Harbour Robotics", industry: "Robotics", sizeBand: "11–50"},
      {userId: "u2", displayName: "Daniel Ho", jobTitle: "Head of Data", companyId: "c2", companyDisplayName: "Kowloon Analytics", industry: "Data and analytics", sizeBand: "51–200"},
    ],
    nextCursor: "cursor-2",
  })),
  getDocuments: vi.fn(async () => state.overrides.documents ?? [
    {id: "d1", title: "Member guide 2026", kind: "resource", url: "https://example.org/member-guide-2026.pdf", issuedAt: "2026-09-01T00:00:00.000Z", amount: null, currency: null, status: null},
  ]),
  getMemberEvents: vi.fn(async () => state.overrides.events ?? [
    {id: "e1", slug: "ai-in-logistics-roundtable", title: "AI in logistics roundtable", description: "", startsAt: "2026-11-12T10:00:00.000Z", endsAt: null, venue: "Cyberport, Pok Fu Lam", capacity: 40, memberOnly: true, published: true, registrationMode: "rsvp", visibility: "members_only", externalRegistrationUrl: null},
    {id: "e2", slug: "smart-city-summit", title: "Smart City Summit 2026", description: "", startsAt: "2026-12-03T01:00:00.000Z", endsAt: null, venue: "Hong Kong Convention and Exhibition Centre", capacity: null, memberOnly: false, published: true, registrationMode: "external", visibility: "public", externalRegistrationUrl: "https://example.org/smart-city-summit"},
  ]),
}));
const memberEventRow = {
  id: "11111111-1111-4111-8111-111111111111", slug: "warehouse-robotics-open-day", title_en: "Warehouse robotics open day", title_zh: "倉庫機械人開放日",
  description_en: "See the picker at work in a live warehouse.", description_zh: "", starts_at: "2026-11-20T06:00:00.000Z", ends_at: "2026-11-20T09:00:00.000Z",
  venue: "Kwai Chung", capacity: 30, status: "draft", visibility: "public", format: "in_person", online_url: null, registration_mode: "rsvp",
  external_registration_url: null, tags: ["robotics"], hero_media_id: null, rejection_reason: null, submitted_at: null, published_at: null, organiser_company_id: "c1",
};
const eventsContext = {companyId: "c1", companyName: "Harbour Robotics", plan: "startup", usedThisQuarter: 1, limit: 2, canPublish: true};
vi.mock("@/lib/events/member-core", () => ({
  listMyCompanyEvents: vi.fn(async () => ("mine" in state.overrides ? state.overrides.mine : {context: eventsContext, events: [memberEventRow]})),
  loadMemberEventsContext: vi.fn(async () => eventsContext),
}));
vi.mock("@/lib/events/member-actions", () => ({saveMemberEventAction: vi.fn()}));
vi.mock("@/lib/db/repos/events", () => ({registerForEvent: vi.fn(), eventsRepository: {getForMemberEdit: vi.fn(async () => state.overrides.editRow ?? memberEventRow)}}));
vi.mock("@/lib/portal/event-action-core", () => ({runEventRegistrationAction: vi.fn()}));

import PortalLayout from "@/app/[locale]/(member)/portal/layout";
import PortalPage from "@/app/[locale]/(member)/portal/page";
import BillingPage from "@/app/[locale]/(member)/portal/billing/page";
import CompanyPage from "@/app/[locale]/(member)/portal/company/page";
import CompanyShowcaseListingPage from "@/app/[locale]/(member)/portal/company/listing/page";
import CompanySeatsPage from "@/app/[locale]/(member)/portal/company/seats/page";
import SeatInvitationAcceptancePage from "@/app/[locale]/(member)/portal/company/seats/accept/page";
import DirectoryPage from "@/app/[locale]/(member)/portal/directory/page";
import DocumentsPage from "@/app/[locale]/(member)/portal/documents/page";
import MemberEventsPage from "@/app/[locale]/(member)/portal/events/page";
import NewMemberEventPage from "@/app/[locale]/(member)/portal/events/new/page";
import EditMemberEventPage from "@/app/[locale]/(member)/portal/events/[id]/edit/page";
import ProfilePage from "@/app/[locale]/(member)/portal/profile/page";
import PortalToolsPage from "@/app/[locale]/(member)/portal/tools/page";
import PortalToolPage from "@/app/[locale]/(member)/portal/tools/[key]/page";

const outDir = resolve(process.cwd(), ".tmp/portal-fixtures");
const params = Promise.resolve({locale: "en"});
const noQuery = Promise.resolve({});
// The fixture is loaded with page.setContent and every request is aborted, so a logo preview
// pointing at /api/media/{id} would paint as a broken image; swap in the WTIA logo inline.
const LOGO_MEDIA_ID = "3f1c2a4e-8b7d-4c6e-9a1b-2d3e4f5a6b7c";
const logoDataUri = `data:image/png;base64,${readFileSync(resolve(process.cwd(), "public/images/wtia-logo.png")).toString("base64")}`;

function documentFor(name: string, body: string): string {
  return `<!doctype html><html lang="${state.locale}"><head><meta charset="utf-8"><title>${name}</title></head><body>${body}</body></html>`;
}

async function shell(page: ReactNode): Promise<ReactElement> {
  return PortalLayout({children: page, params: Promise.resolve({locale: state.locale})}) as Promise<ReactElement>;
}

async function writeFixture(name: string, pathname: string, page: () => Promise<ReactNode>): Promise<string> {
  state.pathname = pathname;
  const html = renderToStaticMarkup(await shell(await page()))
    .replace(/src="\/api\/media\/[0-9a-f-]{36}"/g, `src="${logoDataUri}"`)
    // The tool frame points at another origin, which the spec aborts; an aborted frame paints the
    // browser's error page, which is not what a member sees. A blank frame leaves only our layout.
    .replace(/(<iframe[^>]*?)src="https?:[^"]*"/g, '$1src="about:blank"');
  mkdirSync(outDir, {recursive: true});
  writeFileSync(resolve(outDir, `${name}.html`), documentFor(name, html));
  return html;
}

/** The layout hands PortalShell its navigation as a prop; find that element in the tree. */
function findNavigation(node: unknown): ReactElement | null {
  if (!isValidElement(node)) return Array.isArray(node) ? node.map(findNavigation).find(Boolean) ?? null : null;
  const props = node.props as {navigation?: ReactElement; children?: unknown};
  if (props.navigation) return props.navigation;
  return findNavigation(props.children);
}

describe("portal render fixtures", () => {
  beforeEach(() => {
    state.dashboard = dashboard();
    state.locale = "en";
    state.seatLimit = 3;
    state.overrides = {};
    process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN = "fixture-token";
  });

  // Vitest shares process.env across files in a worker; a token left set would let another
  // file's "no token configured" case pass or fail by test order.
  afterEach(() => {
    delete process.env.MEMBER_TOOL_CONTENT_CALENDAR_TOKEN;
  });

  const dashboardStates: ReadonlyArray<[string, () => DashboardViewModel]> = [
    ["dashboard-new-member", () => dashboard({status: "pending_review", onboarding: {completedSteps: 0, totalSteps: 2, nextAction: "complete-profile", profileComplete: false, companyComplete: false}})],
    ["dashboard-onboarding", () => dashboard({onboarding: {completedSteps: 1, totalSteps: 2, nextAction: "complete-company", profileComplete: true, companyComplete: false}})],
    ["dashboard-past-due", () => dashboard({status: "past_due"})],
    ["dashboard-all-done", () => dashboard()],
  ];

  it.each(dashboardStates)("writes %s", async (name, build) => {
    state.dashboard = build();
    const html = await writeFixture(name, "/portal", () => PortalPage({params}));
    expect(html.match(/<main id="main-content"/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("writes the dashboard with the phone menu open", async () => {
    // Radix renders the sheet through a portal only after mount, so the open panel cannot come
    // out of renderToStaticMarkup. Mount the layout's own navigation element in jsdom, open it,
    // and append the portalled panel to the static all-done page, where the browser would put it.
    state.pathname = "/portal";
    const layout = await shell(await PortalPage({params}));
    const navigation = findNavigation(layout);
    expect(navigation).not.toBeNull();
    const {container, unmount} = render(navigation!);
    fireEvent.click(container.querySelector(".portal-nav-menu-button")!);
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    const panel = Array.from(document.body.children).filter((element) => element !== container).map((element) => element.outerHTML).join("");
    unmount();
    const page = renderToStaticMarkup(layout).replace('aria-expanded="false" data-state="closed"', 'aria-expanded="true" data-state="open"');
    mkdirSync(outDir, {recursive: true});
    writeFileSync(resolve(outDir, "dashboard-phone-menu.html"), documentFor("dashboard-phone-menu", page + panel));
    expect(panel).toContain("portal-nav-sheet");
  });

  const pages: ReadonlyArray<[string, string, () => Promise<ReactNode>]> = [
    ["profile", "/portal/profile", () => ProfilePage({params})],
    ["company", "/portal/company", () => CompanyPage({params})],
    ["company-listing", "/portal/company/listing", () => CompanyShowcaseListingPage({params})],
    ["company-seats", "/portal/company/seats", () => CompanySeatsPage({params, searchParams: noQuery})],
    // Without a token the page renders its own error card; with one it accepts and redirects,
    // so the error card is the only state this route ever paints.
    ["company-seats-accept", "/portal/company/seats/accept", () => SeatInvitationAcceptancePage({params, searchParams: noQuery})],
    ["directory", "/portal/directory", () => DirectoryPage({params, searchParams: noQuery})],
    ["documents", "/portal/documents", () => DocumentsPage({params})],
    ["events", "/portal/events", () => MemberEventsPage({params})],
    ["events-new", "/portal/events/new", () => NewMemberEventPage({params, searchParams: Promise.resolve({})})],
    ["events-edit", `/portal/events/${memberEventRow.id}/edit`, () => EditMemberEventPage({params: Promise.resolve({locale: "en", id: memberEventRow.id}), searchParams: noQuery})],
    ["tools", "/portal/tools", () => PortalToolsPage({params})],
    ["tools-detail", "/portal/tools/content-calendar", () => PortalToolPage({params: Promise.resolve({locale: "en", key: "content-calendar"})})],
    ["billing", "/portal/billing", () => BillingPage({params, searchParams: noQuery})],
  ];

  it.each(pages)("writes %s", async (name, pathname, page) => {
    const html = await writeFixture(name, pathname, page);
    expect(html.match(/<main id="main-content"/g)).toHaveLength(1);
  });
  // The member forms (profile, company, listing, seats), each in English and Traditional Chinese.
  // Names end -en / -zh; tests/e2e/portal-experience.spec.ts measures them and checks every control
  // has a label. The setup runs after beforeEach, so each variant starts from the default dashboard.
  type Locale = "en" | "zh-HK";
  const formPages: ReadonlyArray<[string, string, (locale: Locale) => Promise<ReactNode>, () => void]> = [
    ["form-profile", "/portal/profile", (locale) => ProfilePage({params: Promise.resolve({locale})}), () => undefined],
    ["form-company-logo", "/portal/company", (locale) => CompanyPage({params: Promise.resolve({locale})}),
      () => { state.dashboard = dashboard({companies: [{...company, logoMediaId: LOGO_MEDIA_ID}]}); }],
    // The default company is Live: one primary "Save changes" with the review note (final review, Important 1).
    ["form-company", "/portal/company", (locale) => CompanyPage({params: Promise.resolve({locale})}), () => undefined],
    // Returned by WTIA: the reason renders as alert body text, and Save draft + Submit for review return.
    ["form-company-rejected", "/portal/company", (locale) => CompanyPage({params: Promise.resolve({locale})}),
      () => { state.dashboard = dashboard({companies: [{...company, publicProfileStatus: "rejected", profileRejectionReason: "The tagline repeats the company name; describe what the product does."} as DashboardCompany]}); }],
    ["form-company-readonly", "/portal/company", (locale) => CompanyPage({params: Promise.resolve({locale})}),
      () => { state.dashboard = dashboard({companies: [{...company, role: "member", canManage: false} as DashboardCompany]}); }],
    ["form-listing-draft", "/portal/company/listing", (locale) => CompanyShowcaseListingPage({params: Promise.resolve({locale})}), () => undefined],
    ["form-seats-room", "/portal/company/seats", (locale) => CompanySeatsPage({params: Promise.resolve({locale}), searchParams: noQuery}), () => { state.seatLimit = 5; }],
    ["form-seats-full", "/portal/company/seats", (locale) => CompanySeatsPage({params: Promise.resolve({locale}), searchParams: noQuery}), () => { state.seatLimit = 3; }],
    ["form-seats-error", "/portal/company/seats", (locale) => CompanySeatsPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({error: "1"})}), () => { state.seatLimit = 5; }],
    ["form-seats-accept-error", "/portal/company/seats/accept", (locale) => SeatInvitationAcceptancePage({params: Promise.resolve({locale}), searchParams: noQuery}), () => undefined],
  ];
  const formCases = formPages.flatMap(([name, pathname, page, setup]) => (
    [["en", "en"], ["zh", "zh-HK"]] as const
  ).map(([suffix, locale]) => [`${name}-${suffix}`, pathname, locale, page, setup] as const));

  it.each(formCases)("writes %s", async (name, pathname, locale, page, setup) => {
    setup();
    state.locale = locale;
    const html = await writeFixture(name, pathname, () => page(locale));
    expect(html.match(/<main id="main-content"/g)).toHaveLength(1);
    expectTranslated(html, locale);
  });

  // Sub-projects 3 + 4: events, directory, documents, tools and billing, each in English (-en) and
  // Traditional Chinese (-zh). The setup runs after beforeEach and swaps only the reads it names.
  // The WTIA events come back in the page's locale (getMemberEvents takes it), so the -zh list
  // carries Chinese titles and venues to wrap. The organisation's own events show titleZh on zh-HK and
  // fall back to titleEn when it is blank, as "Robotics breakfast" does here.
  const wtiaEvents = (locale: Locale) => {
    const zh = locale === "zh-HK";
    return [
      {id: "e1", slug: "ai-in-logistics-roundtable", title: zh ? "人工智能於物流業的應用圓桌會議" : "AI in logistics roundtable", description: "", startsAt: "2026-11-12T10:00:00.000Z", endsAt: null, venue: zh ? "數碼港，薄扶林" : "Cyberport, Pok Fu Lam", capacity: 40, memberOnly: true, published: true, registrationMode: "rsvp", visibility: "members_only", externalRegistrationUrl: null},
      {id: "e2", slug: "smart-city-summit", title: zh ? "2026 智慧城市高峰會" : "Smart City Summit 2026", description: "", startsAt: "2026-12-03T01:00:00.000Z", endsAt: null, venue: zh ? "香港會議展覽中心" : "Hong Kong Convention and Exhibition Centre", capacity: null, memberOnly: false, published: true, registrationMode: "external", visibility: "public", externalRegistrationUrl: "https://example.org/smart-city-summit"},
      {id: "e3", slug: "wtia-annual-dinner", title: zh ? "WTIA 周年晚宴暨科技創新大獎頒獎典禮" : "WTIA annual dinner and technology innovation awards", description: "", startsAt: "2027-01-15T11:00:00.000Z", endsAt: null, venue: zh ? "香港君悅酒店" : "Grand Hyatt Hong Kong", capacity: 300, memberOnly: false, published: true, registrationMode: "ticketed", visibility: "public", externalRegistrationUrl: null},
      // Ticketed but members-only: no public ticket page to link, so "registration unavailable".
      {id: "e4", slug: "board-briefing", title: zh ? "理事會簡報會" : "Board briefing", description: "", startsAt: "2027-02-04T02:00:00.000Z", endsAt: null, venue: null, capacity: null, memberOnly: true, published: true, registrationMode: "ticketed", visibility: "members_only", externalRegistrationUrl: null},
    ];
  };
  const ownEvents = [
    memberEventRow,
    {...memberEventRow, id: "22222222-2222-4222-8222-222222222222", slug: "picker-demo-week", title_en: "Picker demo week for logistics operators", title_zh: "物流營運商揀貨機械人示範週", status: "pending_review", starts_at: "2026-12-07T02:00:00.000Z"},
    {...memberEventRow, id: "33333333-3333-4333-8333-333333333333", slug: "robotics-breakfast", title_en: "Robotics breakfast", title_zh: "", status: "published", starts_at: "2026-10-22T00:30:00.000Z"},
    {...memberEventRow, id: "44444444-4444-4444-8444-444444444444", slug: "free-robot-giveaway", title_en: "Free robot giveaway", title_zh: "免費送機械人", status: "rejected", starts_at: "2027-01-09T03:00:00.000Z", rejection_reason: "Events must not offer prizes for registration. Remove the giveaway and resubmit."},
  ];
  const rejectedRow = {...memberEventRow, status: "rejected", rejection_reason: "The description does not say who the open day is for. Add the audience and resubmit.", submitted_at: "2026-10-01T02:00:00.000Z"};
  // Long English and Chinese names and companies, to find wrapping problems in the cards.
  const directoryItems = [
    {userId: "u1", displayName: "Ada Chan", jobTitle: "Chief Executive", companyId: "c1", companyDisplayName: "Harbour Robotics", industry: "Robotics", sizeBand: "11–50"},
    {userId: "u2", displayName: "Daniel Ho", jobTitle: "Head of Data", companyId: "c2", companyDisplayName: "Kowloon Analytics", industry: "Data and analytics", sizeBand: "51–200"},
    {userId: "u3", displayName: "陳美玲", jobTitle: "創辦人兼行政總裁", companyId: "c3", companyDisplayName: "九龍灣智能製造有限公司", industry: "製造業", sizeBand: "1–10"},
    {userId: "u4", displayName: "Priya Raman-Lau", jobTitle: "Director of Partnerships and Ecosystem Development", companyId: "c4", companyDisplayName: "Pearl River Delta Cloud Infrastructure Services", industry: "Cloud infrastructure", sizeBand: "201–500"},
  ];
  const billingSummary = (status: string) => ({
    membershipId: "m1", status, canManageBilling: true, recovery: "resume", subscriptionRef: "sub_fixture",
    memberships: [{id: "m1", planCode: "startup", status, companyId: "c1", canManageBilling: true, recovery: "resume", subscriptionRef: "sub_fixture", canViewHistory: true, providerAvailable: true}],
  });
  const withMembership = (overrides: Record<string, unknown>) => {
    state.dashboard = dashboard({memberships: [{...dashboard().memberships[0], ...overrides}] as DashboardViewModel["memberships"]});
  };
  const portalPages: ReadonlyArray<[string, string, (locale: Locale) => Promise<ReactNode>, (locale: Locale) => void]> = [
    ["events-list-own", "/portal/events", (locale) => MemberEventsPage({params: Promise.resolve({locale})}),
      (locale) => { state.overrides.events = wtiaEvents(locale); state.overrides.mine = {context: eventsContext, events: ownEvents}; }],
    ["events-list-plain", "/portal/events", (locale) => MemberEventsPage({params: Promise.resolve({locale})}),
      (locale) => { state.overrides.events = wtiaEvents(locale); state.overrides.mine = null; }],
    ["event-new", "/portal/events/new", (locale) => NewMemberEventPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({})}), () => undefined],
    ["event-edit-rejected", `/portal/events/${memberEventRow.id}/edit`, (locale) => EditMemberEventPage({params: Promise.resolve({locale, id: memberEventRow.id}), searchParams: noQuery}),
      () => { state.overrides.editRow = rejectedRow; }],
    ["directory-results", "/portal/directory", (locale) => DirectoryPage({params: Promise.resolve({locale}), searchParams: noQuery}),
      () => { state.overrides.directory = {items: directoryItems, nextCursor: "cursor-2"}; }],
    ["directory-no-hits", "/portal/directory", (locale) => DirectoryPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({q: "quantum computing"})}),
      () => { state.overrides.directory = {items: [], nextCursor: null}; }],
    // A cursor in the URL and another page after it: both paging links, at opposite ends.
    ["directory-page2", "/portal/directory", (locale) => DirectoryPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({q: "robotics", cursor: "cursor-2"})}),
      () => { state.overrides.directory = {items: directoryItems.slice(2), nextCursor: "cursor-3"}; }],
    ["documents-both", "/portal/documents", (locale) => DocumentsPage({params: Promise.resolve({locale})}),
      () => { state.overrides.documents = [
        // Receipts are titled with their Stripe invoice id, as lib/portal/content.ts maps them; the list
        // must never paint it (final review I1), so the screenshots prove the amount title instead.
        {id: "in_1QfixtureApr2026", title: "in_1QfixtureApr2026", kind: "receipt", url: "https://invoice.stripe.example/i/acct_1/test_receipt", issuedAt: "2026-04-01T00:00:00.000Z", amount: 880000, currency: "hkd", status: "paid"},
        {id: "in_1QfixtureJul2026", title: "in_1QfixtureJul2026", kind: "receipt", url: "https://invoice.stripe.example/i/acct_1/test_seat", issuedAt: "2026-07-14T00:00:00.000Z", amount: 120000, currency: "hkd", status: "paid"},
        {id: "d1", title: "Member guide 2026", kind: "resource", url: "https://example.org/member-guide-2026.pdf", issuedAt: "2026-09-01T00:00:00.000Z", amount: null, currency: null, status: null},
        {id: "d2", title: "Hong Kong AI governance briefing for small and medium enterprises", kind: "resource", url: "/resources/ai-governance-briefing", issuedAt: "2026-06-18T00:00:00.000Z", amount: null, currency: null, status: null},
      ]; }],
    ["documents-empty", "/portal/documents", (locale) => DocumentsPage({params: Promise.resolve({locale})}), () => { state.overrides.documents = []; }],
    ["tools-available", "/portal/tools", (locale) => PortalToolsPage({params: Promise.resolve({locale})}), () => undefined],
    ["tools-locked", "/portal/tools", (locale) => PortalToolsPage({params: Promise.resolve({locale})}), () => withMembership({planCode: "community"})],
    ["tool-page", "/portal/tools/content-calendar", (locale) => PortalToolPage({params: Promise.resolve({locale, key: "content-calendar"})}), () => undefined],
    ["billing-active", "/portal/billing", (locale) => BillingPage({params: Promise.resolve({locale}), searchParams: noQuery}), () => undefined],
    ["billing-ending", "/portal/billing", (locale) => BillingPage({params: Promise.resolve({locale}), searchParams: noQuery}), () => withMembership({cancelAtPeriodEnd: true})],
    ["billing-past-due", "/portal/billing", (locale) => BillingPage({params: Promise.resolve({locale}), searchParams: noQuery}),
      () => { state.dashboard = dashboard({status: "past_due"}); state.overrides.billing = billingSummary("past_due"); }],
    ["billing-error", "/portal/billing", (locale) => BillingPage({params: Promise.resolve({locale}), searchParams: Promise.resolve({error: "1"})}), () => undefined],
  ];
  const portalCases = portalPages.flatMap(([name, pathname, page, setup]) => (
    [["en", "en"], ["zh", "zh-HK"]] as const
  ).map(([suffix, locale]) => [`${name}-${suffix}`, pathname, locale, page, setup] as const));

  it.each(portalCases)("writes %s", async (name, pathname, locale, page, setup) => {
    setup(locale);
    state.locale = locale;
    const html = await writeFixture(name, pathname, () => page(locale));
    expect(html.match(/<main id="main-content"/g)).toHaveLength(1);
    expect(html.match(/<h1/g)).toHaveLength(1);
    expectTranslated(html, locale);
    // A Stripe invoice id is never a heading or any other painted text.
    expect(html).not.toMatch(/>in_1Q/);
  });

  it("titles receipts by amount, not the Stripe invoice id", async () => {
    const [, pathname, page, setup] = portalPages.find(([name]) => name === "documents-both")!;
    for (const [locale, title] of [["en", "Receipt — HK$8,800.00"], ["zh-HK", "收據 — HK$8,800.00"]] as const) {
      setup(locale);
      state.locale = locale;
      const html = await writeFixture(`documents-both-${locale === "en" ? "en" : "zh"}`, pathname, () => page(locale));
      expect(html).toContain(`<h3>${title}</h3>`);
      expect(html).not.toContain("in_1Qfixture");
    }
  });

  it("shows the member's Chinese event titles on zh-HK, falling back to English when blank", async () => {
    const [, pathname, page, setup] = portalPages.find(([name]) => name === "events-list-own")!;
    setup("zh-HK");
    state.locale = "zh-HK";
    const zh = await writeFixture("events-list-own-zh", pathname, () => page("zh-HK"));
    expect(zh).toContain("<h3>物流營運商揀貨機械人示範週</h3>");
    expect(zh).toContain("<h3>Robotics breakfast</h3>");
    expect(zh).not.toContain("<h3>Picker demo week for logistics operators</h3>");
    setup("en");
    state.locale = "en";
    const en = await writeFixture("events-list-own-en", pathname, () => page("en"));
    expect(en).toContain("<h3>Picker demo week for logistics operators</h3>");
    // The date block is a <time> with the full date for screen readers; the tile itself is aria-hidden.
    expect(en).toMatch(/<time class="portal-date-block" dateTime="2026-12-07T02:00:00.000Z"><span aria-hidden="true" class="portal-date-day">7<\/span>/);
    expect(en).toContain('<span class="sr-only">7 December 2026</span>');
  });
});

function expectTranslated(html: string, locale: "en" | "zh-HK") {
  // A missing key renders as its own path ("Portal.profileGroups.contact"); the key-echo mocks in
  // the per-page unit tests cannot see that, the real catalogues here can.
  expect(html).not.toMatch(/\bPortal\.[A-Za-z]+\.[A-Za-z]/);
  if (locale === "zh-HK") expect(html).toMatch(/[一-鿿]/);
  // The 11px uppercase status label carries a status word, never a sentence: a sentence there
  // (an error, a rejection reason, the listing's "Draft — visible only to…") is unreadable.
  const statusLabels = [...html.matchAll(/class="[^"]*\bstatus-label\b[^"]*"[^>]*>([^<]*)</g)].map((m) => m[1]);
  for (const text of statusLabels) expect(text, `status label "${text}"`).not.toMatch(/—|[.。]$/);
}
