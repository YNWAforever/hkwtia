/**
 * T04/T16/T18 genuine Stripe TEST ticket/refund reproduction, 2026-09-27.
 * Run from repository root with Node 24 --conditions=react-server and the
 * isolated variables in release-runbook.md. Requires real synthetic staff Auth,
 * local Next on localhost:3011, paused workers, test email transport, matching
 * Stripe CLI webhook signing secret and a private TICKET_PASS_TOKEN_SECRET.
 * Stripe CLI 1.52.0: .tmp/audit-release/stripe-cli/stripe.exe with private config
 * .playwright/audit-stripe-cli.toml. Creates one new synthetic event/order per run.
 * Uses a public Stripe test card; no real funds or recipient delivery.
 * Replays the original signed event. JSON/screenshots remain ignored locally.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { chromium, expect as baseExpect } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 45000 });
import Stripe from "stripe";
import { Pool } from "pg";
import { signPassToken } from "../lib/tickets/pass-token.ts";
async function main() {
  const env = process.env;
  if (
    env.AUDIT_ISOLATED_ACCEPTANCE !== "true" ||
    env.AUDIT_BATCH_WORKER_PAUSED !== "true" ||
    env.EMAIL_DELIVERY_MODE !== "test" ||
    env.NODE_ENV === "production" ||
    !env.TICKET_PASS_TOKEN_SECRET ||
    !env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_") ||
    env.DATABASE_URL !== env.DATABASE_URL_TEST ||
    new URL(env.DATABASE_URL_TEST).hostname !== env.M2_TEST_NEON_HOST ||
    env.APP_URL !== "http://localhost:3011" ||
    env.PLAYWRIGHT_BASE_URL !== env.APP_URL
  )
    throw new Error("ISOLATED_TEST_REQUIRED");
  const stripe = new Stripe(env.STRIPE_TEST_SECRET_KEY),
    pool = new Pool({ connectionString: env.DATABASE_URL_TEST });
  const evidence = {
    scope:
      "Synthetic ticket payment and staff refund; Stripe TEST; isolated DB/Auth; email test transport",
    steps: [],
    deliveries: [],
  };
  let checkoutEvent;
  const forward = async (entry) => {
    const response = await fetch(env.APP_URL + "/api/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": entry.signature,
      },
      body: entry.body,
    });
    const outcome = await response.json();
    evidence.deliveries.push({
      eventId: entry.id,
      type: entry.type,
      status: response.status,
      outcome,
    });
    return response.status;
  };
  const relay = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/api/stripe/webhook") {
      res.writeHead(404).end();
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    try {
      const event = stripe.webhooks.constructEvent(
        body,
        req.headers["stripe-signature"],
        env.STRIPE_TEST_WEBHOOK_SECRET,
      );
      if (event.livemode) throw new Error("LIVE_FORBIDDEN");
      const entry = {
        id: event.id,
        type: event.type,
        body,
        signature: req.headers["stripe-signature"],
      };
      checkoutEvent = entry;
      await forward(entry);
      res.writeHead(200).end("accepted");
    } catch {
      res.writeHead(400).end("refused");
    }
  });
  await new Promise((resolve) => relay.listen(3012, "127.0.0.1", resolve));
  const child = spawn(
    ".tmp/audit-release/stripe-cli/stripe.exe",
    [
      "--config",
      ".playwright/audit-stripe-cli.toml",
      "--device-name",
      "hkwtia-audit-20260927",
      "listen",
      "--skip-update",
      "--events-from",
      "@self",
      "--events",
      "checkout.session.completed",
      "--forward-to",
      "http://127.0.0.1:3012/api/stripe/webhook",
    ],
    {
      env: { ...env, STRIPE_API_KEY: env.STRIPE_TEST_SECRET_KEY },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let readyResolve;
  const ready = new Promise((resolve) => (readyResolve = resolve));
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (data) => {
      if (data.toString().includes("Ready!")) readyResolve();
    });
  const browser = await chromium.launch();
  let activePage;
  try {
    await Promise.race([
      ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LISTENER_NOT_READY")), 45000),
      ),
    ]);
    const en = JSON.parse(readFileSync("messages/en.json", "utf8")),
      zh = JSON.parse(readFileSync("messages/zh-HK.json", "utf8"));
    const staffContext = await browser.newContext({ baseURL: env.APP_URL }),
      staff = await staffContext.newPage();
    activePage = staff;
    staff.setDefaultTimeout(45000);
    await staff.goto("/");
    const login = await staff.request.post("/api/auth/sign-in/email", {
      headers: { Origin: env.APP_URL },
      data: {
        email: env.M2_TEST_STAFF_EMAIL,
        password: env.M2_TEST_STAFF_PASSWORD,
        callbackURL: "/admin",
      },
    });
    expect(login.ok()).toBe(true);
    const slug = "audit-paid-refund-" + Date.now();
    await staff.goto("/admin/events-mgmt");
    const form = staff.locator("form:has(input[name=slug])").first();
    for (const [name, value] of [
      ["slug", slug],
      ["titleEn", "Synthetic ticket refund " + slug],
      ["startsAt", "2030-03-01T10:00"],
      ["capacity", "10"],
    ])
      await form.locator(`input[name=${name}]`).fill(value);
    await form
      .locator("textarea[name=descriptionEn]")
      .fill("Isolated test payment, three seats, staff refund.");
    await form
      .locator("select[name=registrationMode]")
      .selectOption("ticketed");
    await form.locator("input[name=ticketPriceHkdCents]").fill("25");
    await form.locator("select[name=visibility]").selectOption("public");
    await form.locator("input[name=published]").check();
    await form
      .getByRole("button", { name: en.Admin.eventsMgmt.create, exact: true })
      .click();
    await expect(form.getByRole("status")).toHaveText(
      en.Admin.eventsMgmt.createSuccess,
    );
    const eventId = (
      await pool.query("SELECT id FROM events WHERE slug=$1", [slug])
    ).rows[0].id;
    evidence.eventId = eventId;
    const buyerContext = await browser.newContext({ baseURL: env.APP_URL }),
      buyer = await buyerContext.newPage();
    activePage = buyer;
    buyer.setDefaultTimeout(45000);
    const proxyIp = `2001:db8:${randomUUID().replaceAll("-", "").match(/.{4}/g).slice(0, 6).join(":")}`;
    await buyer.route(env.APP_URL + "/**", (route) =>
      route.continue({
        headers: { ...route.request().headers(), "x-real-ip": proxyIp },
      }),
    );
    await buyer.goto("/events/" + slug);
    const checkout = buyer.locator("form:has(select[name=quantity])");
    await expect(
      checkout.getByRole("button", { name: en.Ticket.submit, exact: true }),
    ).toBeEnabled();
    await checkout.locator("select[name=quantity]").selectOption("3");
    await expect(checkout.locator("input[name^=seatName-]")).toHaveCount(3);
    await checkout
      .locator("input[name=buyerName]")
      .fill("Synthetic Audit Buyer");
    await checkout
      .locator("input[name=buyerEmail]")
      .fill("buyer@ticket.example.test");
    for (let i = 0; i < 3; i++) {
      await checkout
        .locator(`input[name=seatName-${i}]`)
        .fill("Synthetic Seat " + (i + 1));
      await checkout
        .locator(`input[name=seatEmail-${i}]`)
        .fill(`seat${i + 1}@ticket.example.test`);
    }
    await expect(
      checkout.getByRole("button", { name: en.Ticket.submit, exact: true }),
    ).toBeEnabled();
    await expect(checkout.locator("input[name^=seatName-]")).toHaveCount(3);
    await checkout
      .getByRole("button", { name: en.Ticket.submit, exact: true })
      .click();
    await buyer.waitForURL(/checkout\.stripe\.com/);
    const order = (
      await pool.query(
        "SELECT id,stripe_checkout_session_id,amount_hkd_cents,status FROM event_orders WHERE event_id=$1",
        [eventId],
      )
    ).rows[0];
    expect(order.amount_hkd_cents).toBe(7500);
    evidence.orderId = order.id;
    const session = await stripe.checkout.sessions.retrieve(
      order.stripe_checkout_session_id,
    );
    expect(session.livemode).toBe(false);
    expect(session.amount_total).toBe(7500);
    expect(session.currency).toBe("hkd");
    evidence.sessionId = session.id;
    await buyer.locator("#email").waitFor();
    const currency = buyer.getByRole("button", { name: /HKD/ });
    if ((await currency.isVisible()) && (await currency.isEnabled()))
      await currency.click();
    await buyer.locator("#email").fill("buyer@ticket.example.test");
    await buyer.locator("#cardNumber").fill("4242424242424242");
    await buyer.locator("#cardExpiry").fill("1234");
    await buyer.locator("#cardCvc").fill("123");
    await buyer.locator("#billingName").fill("Synthetic Audit Buyer");
    await buyer.locator("#billingCountry").selectOption("HK");
    await buyer.locator("button[type=submit]").click();
    await buyer.waitForURL(/localhost:3011\/events\//, { timeout: 90000 });
    await expect
      .poll(
        async () =>
          (
            await pool.query("SELECT status FROM event_orders WHERE id=$1", [
              order.id,
            ])
          ).rows[0].status,
        { timeout: 60000 },
      )
      .toBe("paid");
    const paid = await stripe.checkout.sessions.retrieve(session.id);
    expect(paid.payment_status).toBe("paid");
    evidence.payment = {
      amountHkdCents: 7500,
      status: paid.payment_status,
      livemode: paid.livemode,
    };
    const seats = (
      await pool.query(
        "SELECT id,attendee_name FROM event_order_seats WHERE order_id=$1 ORDER BY position",
        [order.id],
      )
    ).rows;
    expect(seats).toHaveLength(3);
    const passToken = signPassToken(
      { seatId: seats[0].id, eventId },
      env.TICKET_PASS_TOKEN_SECRET,
    );
    expect((await buyer.goto("/pass/" + passToken))?.status()).toBe(200);
    await expect(
      buyer.getByText("Synthetic Seat 1", { exact: true }),
    ).toBeVisible();
    evidence.steps.push({
      case: "three-seat payment",
      result:
        "HKD75 provider paid; local paid; exactly three seats; pass HTTP200",
    });
    console.log("three-seat payment and active pass verified");
    activePage = staff;
    await staff.goto(`/admin/events-mgmt/${eventId}?tab=orders`);
    let row = staff.getByRole("row", { name: /Synthetic Audit Buyer/ });
    await expect(row).toContainText(en.Admin.eventsMgmt.orders.statuses.paid);
    await row
      .getByRole("button", {
        name: en.Admin.eventsMgmt.orders.refund,
        exact: true,
      })
      .click();
    await expect(row.getByRole("status")).toContainText("Synthetic Seat 3");
    await row
      .getByRole("button", {
        name: en.Admin.eventsMgmt.orders.cancel,
        exact: true,
      })
      .click();
    expect(
      (
        await pool.query("SELECT status FROM event_orders WHERE id=$1", [
          order.id,
        ])
      ).rows[0].status,
    ).toBe("paid");
    await staff.goto(`/zh/admin/events-mgmt/${eventId}?tab=orders`);
    row = staff.getByRole("row", { name: /Synthetic Audit Buyer/ });
    await row
      .getByRole("button", {
        name: zh.Admin.eventsMgmt.orders.refund,
        exact: true,
      })
      .click();
    await expect(row.getByRole("status")).toContainText("Synthetic Seat 3");
    await row
      .getByRole("button", {
        name: zh.Admin.eventsMgmt.orders.refund,
        exact: true,
      })
      .click();
    await expect(row).toContainText(
      zh.Admin.eventsMgmt.orders.statuses.refunded,
      { timeout: 60000 },
    );
    const refunds = await stripe.refunds.list({
      payment_intent: paid.payment_intent,
    });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0]).toMatchObject({
      amount: 7500,
      currency: "hkd",
      status: "succeeded",
    });
    evidence.refund = {
      id: refunds.data[0].id,
      amount: 7500,
      currency: "hkd",
      status: "succeeded",
    };
    for (const prefix of ["", "/zh"]) {
      await staff.goto(`${prefix}/admin/events-mgmt/${eventId}?tab=attendees`);
      await expect(
        staff.getByRole("row", { name: /Synthetic Seat/ }),
      ).toHaveCount(0);
      expect((await buyer.goto(prefix + "/pass/" + passToken)).status()).toBe(
        404,
      );
    }
    await forward(checkoutEvent);
    expect(
      (
        await pool.query("SELECT status FROM event_orders WHERE id=$1", [
          order.id,
        ])
      ).rows[0].status,
    ).toBe("refunded");
    const facts = (
      await pool.query(
        "SELECT (SELECT count(*)::int FROM audit_events WHERE action='event.order.refunded' AND target_id=$1::text) AS refund_audits,(SELECT count(*)::int FROM ticket_email_outbox WHERE order_id=$1::uuid AND kind='refund') AS refund_notices",
        [order.id],
      )
    ).rows[0];
    expect(facts).toEqual({ refund_audits: 1, refund_notices: 1 });
    expect(
      (await stripe.refunds.list({ payment_intent: paid.payment_intent })).data,
    ).toHaveLength(1);
    evidence.databaseFacts = facts;
    evidence.steps.push({
      case: "staff refund and replay",
      result:
        "bilingual confirmation; one Stripe succeeded full refund; three seats removed; both locale passes HTTP404; replay remains refunded with one audit/notice",
    });
    writeFileSync(
      ".tmp/audit-release/ticket-provider-acceptance.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } catch (e) {
    if (activePage && activePage.url().startsWith(env.APP_URL))
      console.log(
        JSON.stringify({
          alerts: await activePage.getByRole("alert").allTextContents(),
        }),
      );
    if (activePage)
      await activePage.screenshot({
        path: ".tmp/audit-release/ticket-provider-failure.png",
      });
    writeFileSync(
      ".tmp/audit-release/ticket-provider-partial.json",
      JSON.stringify(evidence, null, 2),
    );
    console.error(
      JSON.stringify({
        code: e.code ?? e.name,
        message: e.message?.slice(0, 600),
      }),
    );
    process.exitCode = 1;
  } finally {
    child.kill();
    await browser.close();
    await new Promise((resolve) => relay.close(resolve));
    await pool.end();
  }
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      code: e.code ?? e.name,
      message: e.message?.slice(0, 200),
    }),
  );
  process.exitCode = 1;
});
