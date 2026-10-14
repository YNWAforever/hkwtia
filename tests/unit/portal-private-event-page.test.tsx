import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {PortalAccessDenied} from "@/lib/portal/access-state";
const state = vi.hoisted(() => ({read: vi.fn(), profile: vi.fn(), checkout: vi.fn()}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NOT_FOUND");}}));
vi.mock("@/lib/portal/page-actor", () => ({portalPageActor: async () => ({kind: "member", userId: "auth", profileId: "profile"})}));
vi.mock("@/lib/portal/member-event", () => ({getPortalEvent: state.read}));
vi.mock("@/lib/db/repos/profiles", () => ({profilesRepository: {getById: state.profile}}));
vi.mock("@/lib/tickets/labels", () => ({getTicketCheckoutLabels: async () => ({})}));
vi.mock("@/components/marketing/ticket-checkout-form", () => ({TicketCheckoutForm: (props: Record<string, unknown>) => {state.checkout(props); return <form data-checkout="existing-form"/>;}}));
import Page from "@/app/[locale]/(member)/portal/events/[id]/page";
const event = {id: "event", title: "Private event", description: "Protected details", startsAt: "2099-01-01", venue: "WTIA", registrationMode: "ticketed", ticketPriceHkdCents: 25000};
beforeEach(() => {vi.clearAllMocks(); state.read.mockResolvedValue(event); state.profile.mockResolvedValue({displayName: "Buyer", email: "buyer@example.test"});});
describe("protected event purchase page", () => {
  it.each(["en", "zh-HK"])("uses the existing checkout with own profile and localized policy in %s", async (locale) => {
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({locale, id: "event"})}));
    expect(html).toContain("Protected details");
    expect(state.profile).toHaveBeenCalledWith(expect.objectContaining({profileId: "profile"}), "profile");
    expect(state.checkout).toHaveBeenCalledWith(expect.objectContaining({eventId: "event", locale, unitAmountHkdCents: 25000,
      defaultBuyerName: "Buyer", defaultBuyerEmail: "buyer@example.test", refundPolicyHref: `${locale === "zh-HK" ? "/zh" : ""}/refund-policy`}));
  });
  it("shows benefit recovery before reading private profile or rendering checkout", async () => {
    state.read.mockRejectedValue(new PortalAccessDenied({status: "inactive"}));
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({locale: "en", id: "event"})}));
    expect(html).toContain('href="/portal/billing"');
    expect(state.profile).not.toHaveBeenCalled();
    expect(state.checkout).not.toHaveBeenCalled();
  });
  it("returns not-found without buyer data for an unavailable event", async () => {
    state.read.mockResolvedValue(null);
    await expect(Page({params: Promise.resolve({locale: "en", id: "event"})})).rejects.toThrow("NOT_FOUND");
    expect(state.profile).not.toHaveBeenCalled();
  });
  it.each([{registrationMode: "rsvp"}, {ticketPriceHkdCents: null}, {startsAt: "2000-01-01"}])("does not open checkout when not purchasable: %j", async (change) => {
    state.read.mockResolvedValue({...event, ...change});
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({locale: "en", id: "event"})}));
    expect(html).toContain("events.registrationUnavailable");
    expect(state.checkout).not.toHaveBeenCalled();
  });
});
