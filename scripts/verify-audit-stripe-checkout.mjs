/**
 * Recorded T05/T18 provider acceptance reproduction. Run from the repository root
 * with the isolated variables listed in release-runbook.md and Stripe CLI 1.52.0
 * at .tmp/audit-release/stripe-cli/stripe.exe. The matching CLI signing secret
 * must already be configured in the local app. Only localhost:3011 is allowed.
 *
 * Requires a fresh pending synthetic membership: a successful run consumes it.
 * Public Stripe TEST card values only: https://docs.stripe.com/testing
 * CLI forwards actual provider-signed events through a loopback holding relay;
 * no event is fabricated or resigned. Worker must remain paused.
 * Screenshots stay ignored locally; output JSON contains no credentials.
 */
import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { chromium, expect } from "@playwright/test";
import Stripe from "stripe";
import { Pool } from "pg";
async function main() {
  const env = process.env;
  if (
    env.AUDIT_ISOLATED_ACCEPTANCE !== "true" ||
    env.AUDIT_BATCH_WORKER_PAUSED !== "true" ||
    !env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_") ||
    new URL(env.DATABASE_URL_TEST).hostname !== env.M2_TEST_NEON_HOST ||
    env.PLAYWRIGHT_BASE_URL !== "http://localhost:3011" ||
    env.APP_URL !== env.PLAYWRIGHT_BASE_URL ||
    env.DATABASE_URL !== env.DATABASE_URL_TEST ||
    env.NODE_ENV === "production"
  )
    throw new Error("ISOLATED_TEST_REQUIRED");
  const stripe = new Stripe(env.STRIPE_TEST_SECRET_KEY),
    pool = new Pool({ connectionString: env.DATABASE_URL_TEST });
  const evidence = {
    scope: "Stripe TEST mode, isolated Neon, synthetic identity, worker paused",
    steps: [],
    deliveries: [],
  };
  const queue = [];
  let holding = true;
  const forward = async (event) => {
    const response = await fetch(env.APP_URL + "/api/stripe/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": event.signature,
      },
      body: event.body,
    });
    const body = await response.json();
    evidence.deliveries.push({
      eventId: event.id,
      type: event.type,
      status: response.status,
      outcome: body,
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
      if (event.livemode) throw new Error("LIVE_EVENT_FORBIDDEN");
      const entry = {
        id: event.id,
        type: event.type,
        body,
        signature: req.headers["stripe-signature"],
      };
      queue.push(entry);
      if (!holding) await forward(entry);
      res.writeHead(200).end("accepted by isolated relay");
    } catch {
      res.writeHead(400).end("invalid test event");
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
      "checkout.session.completed,checkout.session.async_payment_succeeded,invoice.paid,invoice.payment_failed,customer.subscription.updated,customer.subscription.deleted",
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
  let activePage;
  const browser = await chromium.launch();
  try {
    await Promise.race([
      ready,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("LISTENER_NOT_READY")), 45000),
      ),
    ]);
    const context = await browser.newContext({
        baseURL: env.APP_URL,
        locale: "en-US",
      }),
      page = await context.newPage();
    activePage = page;
    page.setDefaultTimeout(30000);
    await page.goto("/");
    const signIn = await page.request.post("/api/auth/sign-in/email", {
      headers: { Origin: env.APP_URL },
      data: {
        email: env.M2_TEST_MEMBER_EMAIL,
        password: env.M2_TEST_MEMBER_PASSWORD,
        callbackURL: "/portal",
      },
    });
    expect(signIn.ok()).toBe(true);
    const id = env.HKWTIA_TEST_PENDING_MEMBERSHIP_ID;
    const status = () =>
      page.request
        .get("/api/membership/checkout-status?membershipId=" + id)
        .then((r) => r.json());
    expect(await status()).toEqual({ status: "processing" });
    await page.goto("/join/checkout?membership_id=" + id);
    await page
      .getByRole("button", { name: "Continue to secure payment" })
      .click();
    await page.waitForURL(/checkout\.stripe\.com/);
    const row = (
      await pool.query(
        "SELECT stripe_checkout_session_id FROM billing_attempts WHERE membership_id=$1 ORDER BY created_at DESC LIMIT 1",
        [id],
      )
    ).rows[0];
    const session = await stripe.checkout.sessions.retrieve(
      row.stripe_checkout_session_id,
    );
    expect(session.livemode).toBe(false);
    expect(session.metadata.membershipId).toBe(id);
    expect(session.currency).toBe("hkd");
    evidence.sessionId = session.id;
    evidence.membershipId = id;
    evidence.paymentMethods = session.payment_method_types;
    await page.locator("#email").waitFor();
    const currency = page.getByRole("button", { name: /HKD/ });
    if (await currency.isVisible()) {
      if (await currency.isEnabled()) await currency.click();
      await expect(page.getByText("HK$2,400.00").first()).toBeVisible();
    }
    await page.locator("#email").fill(env.M2_TEST_MEMBER_EMAIL);
    await page.locator("#cardNumber").fill("4000000000000002");
    await page.locator("#cardExpiry").fill("1234");
    await page.locator("#cardCvc").fill("123");
    await page.locator("#billingName").fill("Synthetic Audit Member");
    await page.locator("#billingCountry").selectOption("HK");
    await page.locator("button[type=submit]").click();
    await expect(page.getByText(/declined/).first()).toBeVisible({
      timeout: 45000,
    });
    expect(await status()).toEqual({ status: "processing" });
    evidence.steps.push({
      case: "decline",
      result:
        "declined at provider; membership remains processing; same Checkout session",
    });
    console.log("decline verified");
    await page.locator("#cardNumber").fill("4000000000003220");
    await page.locator("button[type=submit]").click();
    let challenge;
    await expect
      .poll(
        async () => {
          challenge = page
            .frames()
            .find(
              (f) =>
                f.url().includes("3d_secure_2") || f.url().includes("3ds2"),
            );
          return Boolean(challenge);
        },
        { timeout: 45000 },
      )
      .toBe(true);
    await challenge.getByRole("button", { name: /^COMPLETE$/i }).click();
    await page.waitForURL(/localhost:3011\/join\/complete/, { timeout: 90000 });
    await expect(
      page.locator('[data-checkout-status="processing"]'),
    ).toBeVisible();
    expect(await status()).toEqual({ status: "processing" });
    evidence.steps.push({
      case: "3DS and delayed webhook",
      result:
        "challenge completed; real paid Checkout returns processing while signed provider events held",
    });
    console.log("3DS success and pending before webhook verified");
    await expect
      .poll(() => queue.some((x) => x.type === "checkout.session.completed"), {
        timeout: 45000,
      })
      .toBe(true);
    holding = false;
    for (const event of [...queue]) await forward(event);
    await expect(page.locator('[data-checkout-status="active"]')).toBeVisible({
      timeout: 60000,
    });
    expect(await status()).toEqual({ status: "active" });
    evidence.steps.push({
      case: "webhook release",
      result:
        "real Stripe-signed deliveries activate membership and browser polling reveals active",
    });
    const paid = await stripe.checkout.sessions.retrieve(session.id);
    expect(paid.payment_status).toBe("paid");
    expect(paid.status).toBe("complete");
    evidence.provider = {
      status: paid.status,
      paymentStatus: paid.payment_status,
      livemode: paid.livemode,
    };
    const before = await pool.query(
      "SELECT status,stripe_customer_id,stripe_subscription_id FROM memberships WHERE id=$1",
      [id],
    );
    const event = queue.find((x) => x.type === "checkout.session.completed");
    await forward(event);
    const after = await pool.query(
      "SELECT status,stripe_customer_id,stripe_subscription_id FROM memberships WHERE id=$1",
      [id],
    );
    expect(after.rows).toEqual(before.rows);
    evidence.steps.push({
      case: "replay",
      result: "same signed event replay acknowledged without membership change",
    });
    writeFileSync(
      ".tmp/audit-release/stripe-payment-acceptance.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } catch (e) {
    if (activePage)
      await activePage.screenshot({
        path: ".tmp/audit-release/stripe-payment-failure.png",
      });
    writeFileSync(
      ".tmp/audit-release/stripe-payment-partial.json",
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
