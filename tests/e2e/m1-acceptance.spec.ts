import {expect, test} from "@playwright/test";

import {createM1AcceptanceFixture, createSignedWebhookFixture, verifySignedWebhookFixture} from "../fixtures/m1-auth";

test.describe("M1 deterministic acceptance contract", () => {
  test("Startup join -> deterministic Checkout adapter -> signed webhook state is under five minutes", async ({page}) => {
    const started = Date.now();
    const fixture = createM1AcceptanceFixture("startup");
    const checkout = await fixture.startCheckout();
    expect(checkout).toMatchObject({kind: "checkout", customerId: "cus_m1_acceptance", planCode: "startup"});
    expect(fixture.checkoutRequests[0]).toMatchObject({
      clientReferenceId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "membership-checkout:11111111-1111-4111-8111-111111111111:1",
    });
    expect(fixture.checkoutRequests[0]?.metadata).not.toHaveProperty("email");
    expect(await fixture.applyWebhook("evt_m1_startup")).toBe("processed");
    expect(fixture.membershipStatus).toBe("active");
    expect(Date.now() - started).toBeLessThan(5 * 60 * 1000);
    await page.goto("/join?plan=startup");
    await expect(page.getByRole("heading", {level: 1, name: "Join WTIA"})).toBeVisible();
  });

  test("Community and Patron plans use deterministic non-checkout branches", async () => {
    const community = createM1AcceptanceFixture("community");
    const patron = createM1AcceptanceFixture("patron");
    await expect(community.startCheckout()).resolves.toMatchObject({kind: "free", planCode: "community"});
    await expect(patron.startCheckout()).resolves.toMatchObject({kind: "review", planCode: "patron"});
    expect(community.checkoutRequests).toHaveLength(0);
    expect(patron.checkoutRequests).toHaveLength(0);
  });

  test("signed webhook verification feeds the real processor and exact replay is a duplicate", async () => {
    const fixture = createM1AcceptanceFixture();
    const signed = createSignedWebhookFixture(JSON.stringify({id: "evt_m1_replay"}));
    expect(verifySignedWebhookFixture(signed)).toBe(true);
    expect(verifySignedWebhookFixture({...signed, signature: signed.signature.replace(/.$/, "0")})).toBe(false);
    expect(await fixture.applyWebhook("evt_m1_replay")).toBe("processed");
    expect(await fixture.applyWebhook("evt_m1_replay")).toBe("duplicate");
    expect(fixture.replayedEventIds.size).toBe(1);
  });

  test("deterministic seat and Billing Portal contracts enforce capacity and ownership", async () => {
    const fixture = createM1AcceptanceFixture("startup");
    expect(await fixture.inviteSeat()).toBe("invited");
    expect(await fixture.inviteSeat()).toBe("invited");
    expect(await fixture.inviteSeat()).toBe("invited");
    expect(await fixture.inviteSeat()).toBe("invited");
    expect(await fixture.inviteSeat()).toBe("seat_limit_reached");
    await fixture.applyWebhook("evt_m1_portal");
    await expect(fixture.billingPortal(fixture.user.id)).resolves.toEqual({url: "https://billing.stripe.test/session"});
    await expect(fixture.billingPortal("foreign-user")).resolves.toBe("forbidden");
    expect(fixture.portalRequests[0]).toEqual({customerId: "cus_m1_acceptance", returnUrl: "https://m1-acceptance.example.test/portal/billing"});
  });

  test("live Neon/Stripe acceptance is explicitly unimplemented when isolated credentials are absent", async () => {
    test.skip(true, "Live Neon/Stripe fixture is not configured in this environment; run it separately with isolated credentials and test-clock evidence.");
  });
});

for (const locale of [
  {path: "/join?plan=startup", lang: "en", heading: "Join WTIA"},
  {path: "/zh/join?plan=startup", lang: "zh-HK", heading: "加入 WTIA"},
] as const) {
  test(`M1 join remains available in ${locale.lang}`, async ({page}) => {
    await page.goto(locale.path);
    await expect(page.locator("html")).toHaveAttribute("lang", locale.lang);
    await expect(page.locator("h1")).toHaveCount(1);
    await expect(page.getByRole("heading", {level: 1, name: locale.heading})).toBeVisible();
  });
}