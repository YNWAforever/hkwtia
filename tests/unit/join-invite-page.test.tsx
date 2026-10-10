import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  open: vi.fn(),
  plans: vi.fn(),
  actor: null as {kind: "member"} | null,
  actorThrows: false,
  ip: "203.0.113.1",
}));

vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  setRequestLocale: vi.fn(),
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => values ? `localized:${key}:${JSON.stringify(values)}` : `localized:${key}`,
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({"x-forwarded-for": `${state.ip}, 10.0.0.1`}),
}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => { if (state.actorThrows) throw new Error("AUTH_ENV"); return state.actor; }}));
vi.mock("@/lib/db/repos/join-invites", () => ({joinInvitesRepository: {open: state.open}}));
vi.mock("@/lib/db/repos/membership-plans", () => ({membershipPlansRepository: {list: state.plans}}));
vi.mock("@/lib/membership/public-catalog", () => ({
  publicPriceIds: () => ({startup: "p", corporate: "q"}),
  buildPublicMembershipCatalog: () => [
    {code: "startup", price: {kind: "paid", options: [{amount: "HK$2,000", cadence: "annual"}]}, cta: {href: "/join?plan=startup", kind: "join"}},
  ],
}));

import InvitePage, {generateMetadata} from "@/app/[locale]/(join)/join/invite/[token]/page";
import {GET} from "@/app/[locale]/(join)/join/invite/[token]/continue/route";

const TOKEN = "A".repeat(43);
const INVITE_ID = "3f0e7a52-1c7e-4a43-9a52-6f1f6f2c9b10";
const opened = {inviteId: INVITE_ID, planCode: "startup", contactDisplayName: "Chan Tai Man", inviterFirstName: "Willy", locale: "en", expiresAt: new Date("2026-11-01T00:00:00.000Z")};

async function render(token = TOKEN, locale = "en") {
  return renderToStaticMarkup(await InvitePage({params: Promise.resolve({locale, token})}));
}
function continueRequest(token = TOKEN, locale = "en", ip = state.ip) {
  return GET(new Request(`https://hkwtia.test/${locale}/join/invite/${token}/continue`, {headers: {"x-forwarded-for": ip}}), {params: Promise.resolve({locale, token})});
}

describe("join invite page", () => {
  let n = 10;
  beforeEach(() => {
    n += 1;
    state.ip = `203.0.113.${n}`;
    state.open.mockReset();
    state.plans.mockReset();
    state.plans.mockResolvedValue([]);
    state.actor = null;
    state.actorThrows = false;
  });

  it("welcomes a valid invite with the lead, inviter, plan and price", async () => {
    state.open.mockResolvedValue(opened);
    const html = await render();
    expect(html).toContain("Chan Tai Man");
    expect(html).toContain("Willy");
    expect(html).toContain("localized:tiers.startup.name");
    expect(html).toContain("HK$2,000");
    expect(html).toContain(`href="/join/invite/${TOKEN}/continue"`);
    // The id is a bearer credential: it must never reach the HTML.
    expect(html).not.toContain(INVITE_ID);
  });

  it("is noindex", async () => {
    await expect(generateMetadata({params: Promise.resolve({locale: "en", token: TOKEN})})).resolves.toMatchObject({robots: {index: false}});
  });

  it("renders the plan name alone when the catalogue cannot be read", async () => {
    state.open.mockResolvedValue(opened);
    state.plans.mockRejectedValue(new Error("db down"));
    const html = await render();
    expect(html).toContain("localized:tiers.startup.name");
    expect(html).not.toContain("HK$2,000");
  });

  it("renders one identical neutral page for unknown, expired, consumed and superseded", async () => {
    state.open.mockResolvedValue(null);
    const a = await render(TOKEN);
    const b = await render("B".repeat(43));
    expect(a).toBe(b);
    expect(a).not.toContain("Chan Tai Man");
    expect(a).not.toContain("tiers.startup");
    expect(a).not.toContain("/continue");
  });

  it("degrades to the neutral page when open throws", async () => {
    state.open.mockResolvedValue(null);
    const neutral = await render();
    state.open.mockRejectedValue(new Error("stamp failed"));
    await expect(render()).resolves.toBe(neutral);
  });

  it("never calls open for a malformed token", async () => {
    await render("not-a-token");
    expect(state.open).not.toHaveBeenCalled();
  });

  it("serves the neutral page for the 21st request in a minute from one address", async () => {
    state.open.mockResolvedValue(opened);
    for (let i = 0; i < 20; i += 1) expect(await render()).toContain("Chan Tai Man");
    const limited = await render();
    expect(limited).not.toContain("Chan Tai Man");
    expect(state.open).toHaveBeenCalledTimes(20);
  });
});

describe("join invite continue route", () => {
  let n = 100;
  beforeEach(() => {
    n += 1;
    state.ip = `198.51.100.${n}`;
    state.open.mockReset();
    state.open.mockResolvedValue(opened);
    state.actor = null;
    state.actorThrows = false;
  });

  it("sets the httpOnly cookie and sends a signed-out visitor to member sign-in with a join continuation", async () => {
    const response = await continueRequest();
    expect(response.status).toBe(303);
    expect(response.cookies.get("wtia_invite")?.value).toBe(INVITE_ID);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/SameSite=lax/i);
    expect(header).toMatch(/Path=\//);
    expect(header).toMatch(/Expires=/i);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/member-login");
    expect(location.searchParams.get("next")).toBe("/join?plan=startup");
    // The id never travels in a URL.
    expect(response.headers.get("location")).not.toContain(INVITE_ID);
  });

  it("sends a signed-in member straight to /join?plan=", async () => {
    state.actor = {kind: "member"};
    const response = await continueRequest(TOKEN, "zh-HK");
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/zh/join");
    expect(location.search).toBe("?plan=startup");
  });

  it("treats an unresolvable session as signed out", async () => {
    state.actorThrows = true;
    const response = await continueRequest();
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/member-login");
  });

  it("returns to the neutral invite page, with no cookie, when the invite is not open or open throws", async () => {
    state.open.mockResolvedValue(null);
    let response = await continueRequest();
    expect(response.status).toBe(303);
    expect(response.cookies.get("wtia_invite")).toBeUndefined();
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe(`/join/invite/${TOKEN}`);
    state.open.mockRejectedValue(new Error("stamp failed"));
    response = await continueRequest();
    expect(response.status).toBe(303);
    expect(response.cookies.get("wtia_invite")).toBeUndefined();
  });

  it("never opens a malformed token", async () => {
    const response = await continueRequest("nope");
    expect(response.status).toBe(303);
    expect(state.open).not.toHaveBeenCalled();
  });
});
