import type {ReactNode} from "react";
import {render, screen} from "@testing-library/react";
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

import en from "@/messages/en.json";

// Real English copy, so the assertions read as what a member sees.
vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async ({namespace}: {namespace: string}) => {
    const scope = namespace.split(".").reduce<Record<string, unknown>>((node, part) => node[part] as Record<string, unknown>, en as Record<string, unknown>);
    const raw = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)[part], scope);
    return Object.assign((key: string, values?: Record<string, string | number>) => String(raw(key)).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? "")), {raw});
  }),
  setRequestLocale: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({children, href, ...props}: {children: ReactNode; href: string}) => <a href={href} {...props}>{children}</a>,
}));
vi.mock("next/navigation", () => ({redirect: vi.fn()}));
vi.mock("@/lib/auth/server", () => ({auth: {signIn: {magicLink: vi.fn()}}}));
vi.mock("@/lib/config/env", () => ({appEnv: () => ({appUrl: "https://example.test"})}));
const requireActor = vi.hoisted(() => vi.fn(async () => ({kind: "member", userId: "u1", profileId: "p1"})));
vi.mock("@/lib/auth/actor", () => ({requireActor}));
const acceptSeatInvitation = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db/repos/seats", () => ({
  inviteSeat: vi.fn(), revokeInvitation: vi.fn(), revokeSeat: vi.fn(), changeSeatRole: vi.fn(), acceptSeatInvitation,
  SeatServiceError: class SeatServiceError extends Error {
    readonly code: string;
    constructor(code: string) { super(code); this.name = "SeatServiceError"; this.code = code; }
  },
}));
vi.mock("@/lib/portal/queries", () => ({getDashboard: vi.fn(async () => ({companies: [{id: "c1"}]}))}));
vi.mock("@/lib/portal/seats", () => ({getSeatOverview: vi.fn()}));

import SeatAcceptPage from "@/app/[locale]/(member)/portal/company/seats/accept/page";
import SeatsPage from "@/app/[locale]/(member)/portal/company/seats/page";
import {SeatServiceError} from "@/lib/db/repos/seats";
import {getSeatOverview} from "@/lib/portal/seats";

const member = (id: string, role: string) => ({id, userId: `user-${id}@example.test`, role});
function overview(members: number, invitations: number, overrides: Record<string, unknown> = {}) {
  return {
    companyId: "c1", seatLimit: 3, canManage: true, canGrantOwner: false,
    members: Array.from({length: members}, (_, i) => member(`m${i}`, i === 0 ? "owner" : "member")),
    invitations: Array.from({length: invitations}, (_, i) => ({id: `i${i}`, invitedEmail: `invitee${i}@example.test`, role: "member"})),
    ...overrides,
  };
}
async function renderSeats(data: unknown) {
  vi.mocked(getSeatOverview).mockResolvedValue(data as never);
  return renderToStaticMarkup(await SeatsPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({})}));
}
const acceptProps = (searchParams: Record<string, string | undefined> = {}) => ({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve(searchParams)});

describe("portal seats page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("at the limit (2 members + 1 invitation of 3) shows the full note and no invite form", async () => {
    const html = await renderSeats(overview(2, 1));
    expect(html).toContain("All seats are in use. Remove a member or a pending invitation to invite someone else.");
    expect(html).not.toContain('name="email"');
    expect(html).not.toContain('name="companyId"');
  });

  it("one under the limit (2 members + 0 invitations of 3) shows the invite form and no note", async () => {
    const html = await renderSeats(overview(2, 0));
    expect(html).not.toContain("All seats are in use");
    for (const field of ["email", "role", "companyId", "locale"]) expect(html).toMatch(new RegExp(String.raw`<(?:input|select)\b[^>]*\bname="${field}"`));
  });

  it("a read-only viewer sees neither the form nor the full note", async () => {
    const html = await renderSeats(overview(2, 1, {canManage: false}));
    expect(html).not.toContain("All seats are in use");
    expect(html).not.toContain('name="email"');
  });

  it("the capacity line carries a progressbar named by the capacity text", async () => {
    const html = await renderSeats(overview(2, 1));
    const bar = html.match(/<[^>]*role="progressbar"[^>]*>/)?.[0] ?? "";
    expect(bar).toContain('aria-valuenow="3"');
    expect(bar).toContain('aria-valuemin="0"');
    expect(bar).toContain('aria-valuemax="3"');
    // Named by the visible sentence, not a duplicate aria-label, so it is announced once.
    expect(bar).toContain('aria-labelledby="seat-capacity-text"');
    expect(bar).not.toContain("aria-label=");
    expect(html).toMatch(/id="seat-capacity-text"[^>]*>3 of 3 seats reserved</);
  });

  it("clamps aria-valuenow to the limit for a company above it, while the text keeps the real count", async () => {
    const html = await renderSeats(overview(4, 1));
    const bar = html.match(/<[^>]*role="progressbar"[^>]*>/)?.[0] ?? "";
    expect(bar).toContain('aria-valuenow="3"');
    expect(bar).toContain('aria-valuemax="3"');
    expect(html).toContain("5 of 3 seats reserved");
  });

  it("the full note has its own class, not the read-only note", async () => {
    const html = await renderSeats(overview(2, 1));
    expect(html).toMatch(/class="portal-seats-full-note"[^>]*>All seats are in use/);
    expect(html).not.toContain("portal-readonly-note");
  });

  it("renders the error as readable alert text, not inside a status label", async () => {
    vi.mocked(getSeatOverview).mockResolvedValue(overview(1, 0) as never);
    const html = renderToStaticMarkup(await SeatsPage({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({error: "1"})}));
    const alert = html.match(/<p\b[^>]*role="alert"[^>]*>(.*?)<\/p>/s);
    expect(alert?.[0]).toContain('class="portal-form-alert"');
    expect(alert?.[1]).toBe("We could not update company seats. Please try again.");
  });

  it("the seat tables carry explicit table roles, so the phone block layout keeps its semantics", async () => {
    const html = await renderSeats(overview(2, 1));
    expect(html.match(/<table\b[^>]*role="table"/g)).toHaveLength(2);
    expect(html.match(/<th\b[^>]*role="columnheader"/g)).toHaveLength(6);
    expect(html.match(/<tr\b[^>]*role="row"/g)).toHaveLength(2 + 3);
    expect(html.match(/<td\b[^>]*role="cell"/g)).toHaveLength(3 * 3);
    expect(html.match(/<t(?:head|body)\b[^>]*role="rowgroup"/g)).toHaveLength(4);
  });

  it("revoke and cancel controls carry the destructive class; change role does not", async () => {
    const html = await renderSeats(overview(2, 1));
    expect(html).toMatch(/class="portal-seat-link portal-seat-danger"[^>]*>Revoke access</);
    expect(html).toMatch(/class="portal-seat-link portal-seat-danger"[^>]*>Cancel invitation</);
    expect(html).toMatch(/class="portal-seat-link"[^>]*>Change role</);
  });

  it("keeps one h1 with the eyebrow label", async () => {
    const html = await renderSeats(overview(1, 0));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("portal-welcome");
  });

  it("each member row exposes email, role and the role and revoke controls in DOM order, labelled for the phone layout", async () => {
    const html = await renderSeats(overview(2, 0));
    const row = html.match(/<tr[^>]*>(?:(?!<\/tr>).)*user-m1@example\.test(?:(?!<\/tr>).)*<\/tr>/s)?.[0] ?? "";
    const order = ["user-m1@example.test", "Member</td>", 'name="role"', "Change role</button>", "Revoke access"].map((needle) => row.indexOf(needle));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(row).toContain('data-label="Member"');
    expect(row).toContain('data-label="Role"');
  });

  it("pending invitation rows carry data-label captions and a cancel control", async () => {
    const html = await renderSeats(overview(1, 1));
    expect(html).toContain('data-label="Email address"');
    expect(html).toContain("Cancel invitation");
    expect(html).toMatch(/name="invitationId"/);
  });
});

describe("seat invitation acceptance errors", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a service error renders the inner honest block, one h1, a /portal back link and keeps one status region", async () => {
    acceptSeatInvitation.mockRejectedValueOnce(new SeatServiceError("INVITATION_EXPIRED" as never));
    const {container} = render(await SeatAcceptPage(acceptProps({token: "t"})));
    expect(container.querySelector(".inner-honest")).not.toBeNull();
    expect(container.querySelectorAll("h1")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("This invitation has expired");
    expect(screen.getByRole("link", {name: /Back to dashboard/})).toHaveAttribute("href", "/portal");
  });

  it("a missing token renders the same block with the generic message", async () => {
    const {container} = render(await SeatAcceptPage(acceptProps()));
    expect(container.querySelector(".inner-honest")).not.toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("We could not update company seats");
    expect(screen.getByRole("link", {name: /Back to dashboard/})).toHaveAttribute("href", "/portal");
  });
});
