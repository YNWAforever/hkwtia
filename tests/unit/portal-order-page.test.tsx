import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({status: "pending", missing: false}));
vi.mock("next-intl/server", () => ({getTranslations: async () => (key: string) => key, setRequestLocale: vi.fn()}));
vi.mock("@/lib/portal/page-actor", () => ({portalPageActor: async () => ({kind: "member", userId: "auth", profileId: "profile"})}));
vi.mock("@/lib/portal/my-orders", () => ({getMyOrder: async () => state.missing ? null : ({id: "order-1", eventId: "event-1", titleEn: "Event", titleZh: "活動", startsAt: new Date("2099-01-01"), amountHkdCents: 25000, currency: "hkd", status: state.status, paidAt: state.status === "paid" ? new Date("2026-10-14") : null, refundedAt: null})}));
vi.mock("@/components/portal/order-recovery", () => ({OrderRecovery: () => <button>Resume existing checkout</button>}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NOT_FOUND");}}));
import OrderPage from "@/app/[locale]/(member)/portal/orders/[orderId]/page";

describe("member order return page uses stored payment state", () => {
  it.each(["en", "zh-HK"])("keeps an unpaid order pending despite a received return flag in %s", async (locale) => {
    state.status = "pending"; state.missing = false;
    const html = renderToStaticMarkup(await OrderPage({params: Promise.resolve({locale, orderId: "order-1"}), searchParams: Promise.resolve({ticket: "received"})}));
    expect(html).toContain("orders.status.pending");
    expect(html).not.toContain("orders.status.paid");
    expect(html).toContain("Resume existing checkout");
    expect(html).toContain(`href="${locale === "zh-HK" ? "/zh" : ""}/portal/orders/order-1"`);
  });
  it("shows paid only from the stored order and hides checkout recovery", async () => {
    state.status = "paid"; state.missing = false;
    const html = renderToStaticMarkup(await OrderPage({params: Promise.resolve({locale: "en", orderId: "order-1"}), searchParams: Promise.resolve({ticket: "cancelled"})}));
    expect(html).toContain("orders.status.paid");
    expect(html).not.toContain("Resume existing checkout");
  });
  it("does not disclose another buyer's order", async () => {
    state.missing = true;
    await expect(OrderPage({params: Promise.resolve({locale: "en", orderId: "order-1"})})).rejects.toThrow("NOT_FOUND");
    state.missing = false;
  });
});
