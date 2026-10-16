import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("@/lib/portal/page-actor", () => ({portalPageActor: async () => ({kind: "member", userId: "auth", profileId: "profile"})}));
vi.mock("@/lib/portal/my-events", () => ({getMyRegistrations: state.read}));
import Page from "@/app/[locale]/(member)/portal/events/my/page";
describe("own activity history page", () => {
  it.each(["en", "zh-HK"])("shows stored registration and pending payment with distinct recovery in %s", async (locale) => {
    const prefix = locale === "zh-HK" ? "/zh" : "";
    state.read.mockResolvedValue({items: [
      {id: "r", eventId: "e", source: "rsvp", status: "waitlist", title: "Registration", startsAt: "2099-01-01", href: `${prefix}/portal/events/e`, eventCancelled: false},
      {id: "o", eventId: "e", source: "ticket", status: "pending", title: "Purchase", startsAt: "2099-01-01", href: `${prefix}/portal/orders/o`, eventCancelled: true},
    ], nextCursor: "next", cursorReset: false});
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({locale}), searchParams: Promise.resolve({cursor: "first"})}));
    expect(html).toContain("myEvents.rsvpStatus.waitlist");
    expect(html).toContain("orders.status.pending");
    expect(html).not.toContain("orders.status.paid");
    expect(html).toContain("myEvents.eventCancelled");
    expect(html).toContain(`href="${prefix}/portal/events/my?cursor=next"`);
    expect(html).toContain(`href="${prefix}/portal/orders/o"`);
    expect(html).toContain("myEvents.passes");
  });
  it("shows reset/empty explicitly and lets unexpected read failures propagate", async () => {
    state.read.mockResolvedValueOnce({items: [], nextCursor: null, cursorReset: true}).mockRejectedValueOnce(new Error("DB_FAILED"));
    const html = renderToStaticMarkup(await Page({params: Promise.resolve({locale: "en"}), searchParams: Promise.resolve({cursor: ["bad", "bad"]})}));
    expect(html).toContain("myEvents.cursorReset");
    expect(html).toContain("myEvents.empty");
    await expect(Page({params: Promise.resolve({locale: "en"})})).rejects.toThrow("DB_FAILED");
  });
});
