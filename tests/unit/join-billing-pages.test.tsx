import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach, describe, expect, it, vi} from "vitest";

const actor = {kind: "member" as const, userId: "user-a", profileId: "profile-a"};
const state = vi.hoisted(() => ({
  membership: {id: "membership-a", applicationId: "application-a", ownerUserId: "user-a", companyId: null, planCode: "startup", status: "pending_payment"} as Record<string, unknown> | null,
  application: {id: "application-a", applicantUserId: "user-a", planCode: "startup", status: "pending_payment"} as Record<string, unknown> | null,
  membershipCalls: [] as unknown[][],
  applicationCalls: [] as unknown[][],
  checkoutCalls: [] as unknown[][],
  redirectUrl: null as string | null,
  notFound: false,
}));

vi.mock("next-intl/server", () => ({setRequestLocale: vi.fn(), getTranslations: async () => (key: string) => `localized:${key}`}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => { state.redirectUrl = url; throw new Error("NEXT_REDIRECT"); },
  notFound: () => { state.notFound = true; throw new Error("NEXT_NOT_FOUND"); },
}));
vi.mock("@/lib/auth/actor", () => ({getActor: async () => actor}));
vi.mock("@/lib/db/repos/memberships", () => ({membershipsRepository: {getById: async (...args: unknown[]) => { state.membershipCalls.push(args); return state.membership; }}}));
vi.mock("@/lib/db/repos/applications", () => ({applicationsRepository: {getById: async (...args: unknown[]) => { state.applicationCalls.push(args); return state.application; }}}));
vi.mock("@/lib/billing/checkout-service", () => ({createCheckoutSession: async (...args: unknown[]) => { state.checkoutCalls.push(args); return {url: "https://checkout.stripe.test/session-a"}; }}));

import CheckoutPage from "@/app/[locale]/(join)/join/checkout/page";
import CompletePage from "@/app/[locale]/(join)/join/complete/page";
import {loadJoinCompletionState} from "@/lib/membership/join-billing-state";

function props(locale = "en") {
  return {params: Promise.resolve({locale}), searchParams: Promise.resolve({membership_id: "membership-a"})};
}

describe("join billing pages", () => {
  beforeEach(() => {
    state.membership = {id: "membership-a", applicationId: "application-a", ownerUserId: "user-a", companyId: null, planCode: "startup", status: "pending_payment"};
    state.application = {id: "application-a", applicantUserId: "user-a", planCode: "startup", status: "pending_payment"};
    state.membershipCalls = [];
    state.applicationCalls = [];
    state.checkoutCalls = [];
    state.redirectUrl = null;
    state.notFound = false;
  });

  it("starts checkout from actor-scoped membership and application state with locale", async () => {
    await expect(CheckoutPage(props("zh-HK"))).rejects.toThrow("NEXT_REDIRECT");
    expect(state.membershipCalls).toEqual([[actor, "membership-a"]]);
    expect(state.applicationCalls).toEqual([[actor, "application-a"]]);
    expect(state.checkoutCalls).toEqual([[actor, "membership-a", "zh-HK"]]);
    expect(state.redirectUrl).toBe("https://checkout.stripe.test/session-a");
  });

  it("fails closed when the scoped application does not match the membership", async () => {
    state.application = {...state.application, planCode: "corporate"};
    await expect(CheckoutPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(state.checkoutCalls).toHaveLength(0);
  });

  it("renders only a processing state after Stripe returns while payment is pending", async () => {
    const markup = renderToStaticMarkup(await CompletePage(props()));
    expect(state.membershipCalls).toEqual([[actor, "membership-a"]]);
    expect(state.applicationCalls).toEqual([[actor, "application-a"]]);
    expect(markup).toContain('data-checkout-status="processing"');
    expect(markup).not.toContain('data-checkout-status="active"');
  });

  it("renders the active projection once the webhook has activated the membership, instead of 404ing", async () => {
    state.membership = {...state.membership, status: "active"};
    const markup = renderToStaticMarkup(await CompletePage(props()));
    expect(state.notFound).toBe(false);
    expect(markup).toContain('data-checkout-status="active"');
    expect(markup).not.toContain('data-checkout-status="processing"');
  });
});

describe("loadJoinCompletionState", () => {
  beforeEach(() => {
    state.membership = {id: "membership-a", applicationId: "application-a", ownerUserId: "user-a", companyId: null, planCode: "startup", status: "pending_payment"};
    state.application = {id: "application-a", applicantUserId: "user-a", planCode: "startup", status: "pending_payment"};
    state.membershipCalls = [];
    state.applicationCalls = [];
    state.notFound = false;
  });

  it("returns a processing projection for a pending_payment membership", async () => {
    const result = await loadJoinCompletionState(actor, "membership-a");
    expect(result).toMatchObject({display: "processing", membership: {applicationId: "application-a", planCode: "startup"}});
  });

  it("returns an active projection for an active membership", async () => {
    state.membership = {...state.membership, status: "active"};
    const result = await loadJoinCompletionState(actor, "membership-a");
    expect(result).toMatchObject({display: "active"});
  });

  it("returns a review projection for a pending_review membership", async () => {
    state.membership = {...state.membership, status: "pending_review"};
    const result = await loadJoinCompletionState(actor, "membership-a");
    expect(result).toMatchObject({display: "review"});
  });

  it.each(["cancelled", "expired", "past_due"])("returns null for a %s membership status", async (status) => {
    state.membership = {...state.membership, status};
    const result = await loadJoinCompletionState(actor, "membership-a");
    expect(result).toBeNull();
  });

  it("returns null when the membership is missing", async () => {
    state.membership = null;
    const result = await loadJoinCompletionState(actor, "membership-a");
    expect(result).toBeNull();
  });

  it("returns null when the application does not match the membership", async () => {
    state.application = {...state.application, planCode: "corporate"};
    const result = await loadJoinCompletionState(actor, "membership-a");
    expect(result).toBeNull();
  });
});
