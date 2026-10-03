/** Actual Stripe TEST Checkout/refund acceptance. Only the confirmed isolated
 * target and synthetic ticket prefix are writable. Raw signatures/cookies/keys
 * stay in memory; committed receipts contain hashed provider references only.
 * Owns a local3450 server,3451 signed-event relay and unique synthetic events.
 */
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHash, randomUUID, randomBytes } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { Pool } from "pg";
import Stripe from "stripe";
import { chromium, expect } from "@playwright/test";
const env = process.env,
  base = "http://localhost:3450",
  run = randomUUID(),
  prefix = "t16-provider-" + run;
const ticketPassSecret = randomBytes(32).toString("base64url");
const localCronSecret = randomBytes(32).toString("base64url");
const proxySuffix = randomBytes(2);
const syntheticProxyIp = `198.18.${proxySuffix[0]}.${proxySuffix[1]}`;
if (
  env.AUDIT_ISOLATED_ACCEPTANCE !== "true" ||
  env.AUDIT_BATCH_WORKER_PAUSED !== "true" ||
  env.DATABASE_URL !== env.DATABASE_URL_TEST ||
  new URL(env.DATABASE_URL_TEST).hostname !==
    "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech" ||
  env.NEON_PROJECT_ID !== "solitary-wave-52860119" ||
  !env.STRIPE_TEST_SECRET_KEY?.startsWith("sk_test_") ||
  env.STRIPE_SECRET_KEY !== env.STRIPE_TEST_SECRET_KEY ||
  env.EMAIL_DELIVERY_MODE !== "test" ||
  env.NODE_ENV === "production"
)
  throw Error("CONFIRMED_ISOLATED_TEST_REQUIRED");
const stripe = new Stripe(env.STRIPE_TEST_SECRET_KEY),
  pool = new Pool({ connectionString: env.DATABASE_URL_TEST });
const mask = (id) =>
  id ? createHash("sha256").update(id).digest("hex").slice(0, 16) : null;
const evidence = {
  scope:
    "confirmed isolated Neon/Auth; synthetic data; Stripe TEST; email test sink",
  production: false,
  run,
  steps: [],
  deliveries: [],
};
const queue = [];
let holding = true,
  stage = "isolation",
  server,
  listener,
  browser,
  signingSecret;
const forward = async (event) => {
  const response = await fetch(base + "/api/stripe/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": event.signature,
    },
    body: event.body,
  });
  const body = await response.json();
  evidence.deliveries.push({
    eventReference: mask(event.id),
    type: event.type,
    http: response.status,
    outcome: body.status ?? body.result ?? body.error ?? null,
  });
  expect(response.status).toBe(200);
};
const relay = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/stripe") {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const event = stripe.webhooks.constructEvent(
      body,
      req.headers["stripe-signature"],
      signingSecret,
    );
    if (event.livemode) throw Error("LIVE_EVENT_FORBIDDEN");
    const object = event.data.object;
    let owned =
      object.metadata?.kind === "event_ticket" && object.metadata?.orderId;
    if (!owned && object.object === "refund")
      owned = object.metadata?.eventOrderId;
    if (!owned) {
      res.writeHead(200).end();
      return;
    }
    const result = await pool.query(
      "SELECT o.id FROM event_orders o JOIN events e ON e.id=o.event_id WHERE o.id=$1 AND e.slug LIKE $2",
      [owned, prefix + "%"],
    );
    if (result.rows.length !== 1) {
      res.writeHead(200).end();
      return;
    }
    const entry = {
      id: event.id,
      type: event.type,
      object,
      body,
      signature: req.headers["stripe-signature"],
    };
    queue.push(entry);
    if (!holding) await forward(entry);
    res.writeHead(200).end();
  } catch {
    res.writeHead(400).end();
  }
});
async function waitUntil(fn, ms = 60000, interval = 200) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await delay(interval);
  }
  throw Error("ACCEPTANCE_WAIT_EXPIRED");
}
async function snapshot(orderId) {
  return (
    await pool.query(
      "SELECT status,amount_hkd_cents,refunded_at FROM event_orders WHERE id=$1",
      [orderId],
    )
  ).rows[0];
}
async function drainTestNotices(orderId, kinds) {
  // This endpoint runs its real cron authorization, ledger and repository.
  // Refuse to invoke a global claim if any pending recipient is non-synthetic.
  const unsafe = await pool.query(
    `SELECT count(*)::int AS n FROM ticket_email_outbox n JOIN event_orders o ON o.id=n.order_id LEFT JOIN event_order_seats s ON s.id=n.seat_id WHERE n.status IN ('queued','sending') AND (o.buyer_email !~ '@([A-Za-z0-9-]+\\.)*example\\.test$' OR (s.id IS NOT NULL AND s.attendee_email !~ '@([A-Za-z0-9-]+\\.)*example\\.test$'))`,
  );
  expect(unsafe.rows[0].n).toBe(0);
  const due = (
    await pool.query(
      "SELECT max(next_attempt_at) AS due FROM ticket_email_outbox WHERE order_id=$1",
      [orderId],
    )
  ).rows[0].due;
  const wait = Math.max(0, new Date(due).getTime() - Date.now() + 100);
  if (wait > 30000) throw Error("NOTICE_DUE_EXCEEDS_LOCAL_BUDGET");
  await delay(wait);
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    const response = await fetch(base + "/api/jobs/ticket-emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + localCronSecret },
    });
    if (response.status !== 200) throw Error("TICKET_JOB_HTTP_FAILED");
    const rows = (
      await pool.query(
        "SELECT kind,status,error_code,provider_id LIKE 'test:%' AS test_sink FROM ticket_email_outbox WHERE order_id=$1 ORDER BY kind",
        [orderId],
      )
    ).rows;
    const selected = rows.filter((x) => kinds.includes(x.kind));
    if (
      selected.length === kinds.length &&
      selected.every((x) => x.status === "sent" && x.test_sink === true)
    )
      return rows;
    await delay(2000);
  }
  throw Error("TICKET_JOB_TEST_SINK_NOT_SETTLED");
}
async function isolatedBrowserContext() {
  const context = await browser.newContext();
  // Model the overwritten ingress header on loopback only. Production proxy
  // policy and the real limiter remain active; never add this to Stripe traffic.
  await context.route("http://localhost:3450/**", (route) =>
    route.continue({
      headers: { ...route.request().headers(), "x-real-ip": syntheticProxyIp },
    }),
  );
  return context;
}
async function checkout(page, kind, card) {
  const id = randomUUID(),
    slug = prefix + "-" + kind;
  await pool.query(
    "INSERT INTO events(id,slug,title_en,title_zh,description_en,description_zh,starts_at,published,status,registration_mode,ticket_price_hkd_cents,capacity,visibility) VALUES($1,$2,'Synthetic Ticket Acceptance','合成票券驗收','Synthetic only','只供合成驗收','2030-12-31',true,'published','ticketed',1000,2,'public')",
    [id, slug],
  );
  await page.goto(base + "/events/" + slug);
  await page.locator('input[name="buyerName"]').fill("Synthetic Buyer");
  await page
    .locator('input[name="buyerEmail"]')
    .fill("buyer-" + run + "@example.test");
  await page.locator('input[name="seatName-0"]').fill("Synthetic Seat");
  await page
    .locator('input[name="seatEmail-0"]')
    .fill("seat-" + run + "@example.test");
  await Promise.all([
    page.waitForURL(/checkout\.stripe\.com/),
    page
      .locator("form")
      .filter({ has: page.locator('input[name="buyerName"]') })
      .locator('button[type="submit"]')
      .click(),
  ]);
  const rows = await pool.query(
    "SELECT id,stripe_checkout_session_id FROM event_orders WHERE event_id=$1",
    [id],
  );
  expect(rows.rows).toHaveLength(1);
  const order = rows.rows[0];
  const session = await stripe.checkout.sessions.retrieve(
    order.stripe_checkout_session_id,
  );
  expect(session.livemode).toBe(false);
  expect(session.amount_total).toBe(1000);
  expect(session.currency).toBe("hkd");
  await page.locator("#email").fill("buyer-" + run + "@example.test");
  await page.locator("#cardNumber").fill(card);
  await page.locator("#cardExpiry").fill("1250");
  await page.locator("#cardCvc").fill("123");
  const name = page.locator("#billingName");
  if (await name.count()) await name.fill("Synthetic Buyer");
  const country = page.locator("#billingCountry");
  if (await country.count()) await country.selectOption("HK");
  const postal = page.locator("#billingPostalCode");
  if (await postal.isVisible()) await postal.fill("00000");
  return { ...order, eventId: id, slug, session };
}
async function verifyAsyncRefund(admin, kind, card, finalStatus) {
  stage = kind;
  const context = await isolatedBrowserContext();
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const x = await checkout(page, kind, card);
  await page.route("**/events/" + x.slug + "?ticket=received", (route) =>
    route.abort(),
  );
  await page.locator("button[type=submit]").click();
  await waitUntil(
    async () =>
      (await stripe.checkout.sessions.retrieve(x.stripe_checkout_session_id))
        .payment_status === "paid",
    90000,
    1000,
  );
  await waitUntil(() =>
    queue.some(
      (e) =>
        e.type === "checkout.session.completed" &&
        e.object.id === x.stripe_checkout_session_id,
    ),
  );
  const completed = queue.find(
    (e) =>
      e.type === "checkout.session.completed" &&
      e.object.id === x.stripe_checkout_session_id,
  );
  await forward(completed);
  expect((await snapshot(x.id)).status).toBe("paid");
  await admin
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: base }]);
  await admin.goto(base + "/en/admin/events-mgmt/" + x.eventId + "?tab=orders");
  await expect(admin.getByText(x.id, { exact: true })).toBeVisible();
  const submitRefund = async () => {
    const [response] = await Promise.all([
      admin.waitForResponse(
        (response) =>
          response.url().startsWith(base) &&
          response.request().method() === "POST" &&
          Boolean(response.request().headers()["next-action"]),
      ),
      admin.getByRole("button", { name: "Refund", exact: true }).click(),
    ]);
    expect(response.ok()).toBe(true);
  };
  await admin.getByRole("button", { name: "Refund", exact: true }).click();
  await submitRefund();
  const intent =
    typeof completed.object.payment_intent === "string"
      ? completed.object.payment_intent
      : completed.object.payment_intent.id;
  const initial = (await stripe.refunds.list({ payment_intent: intent })).data;
  expect(initial).toHaveLength(1);
  const initialApp = (await snapshot(x.id)).status;
  expect(initialApp).toBe(finalStatus === "succeeded" ? "paid" : "refunded");
  if (finalStatus === "succeeded") {
    expect(initial[0].status).toBe("pending");
    // A legitimate retry while accepted/pending must reconcile rather than
    // create a second refund, even if the first response was inconclusive.
    await submitRefund();
    expect(
      (await stripe.refunds.list({ payment_intent: intent })).data,
    ).toHaveLength(1);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='event.order.refunded'",
          [x.id],
        )
      ).rows[0].n,
    ).toBe(0);
  } else expect(initial[0].status).toBe("succeeded");
  await waitUntil(
    async () =>
      (await stripe.refunds.retrieve(initial[0].id)).status === finalStatus,
    180000,
    2000,
  );
  await waitUntil(() =>
    queue.some(
      (e) =>
        e.type.startsWith("refund.") &&
        e.object.id === initial[0].id &&
        e.object.status === finalStatus,
    ),
  );
  const callback = queue.find(
    (e) =>
      e.type.startsWith("refund.") &&
      e.object.id === initial[0].id &&
      e.object.status === finalStatus,
  );
  await forward(callback);
  await forward(callback);
  const finalApp = (await snapshot(x.id)).status;
  expect(finalApp).toBe(
    finalStatus === "succeeded" ? "refunded" : "refund_failed",
  );
  expect(
    (await stripe.refunds.list({ payment_intent: intent })).data,
  ).toHaveLength(1);
  const action =
    finalStatus === "succeeded"
      ? "event.order.refunded"
      : "event.order.refund_failed";
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action=$2",
        [x.id, action],
      )
    ).rows[0].n,
  ).toBe(1);
  evidence.steps.push({
    case: kind,
    refundReference: mask(initial[0].id),
    providerInitial: initial[0].status,
    providerFinal: finalStatus,
    appInitial: initialApp,
    appFinal: finalApp,
    refundCount: 1,
    finalAuditCount: 1,
    actualSignedCallback: true,
    replayed: true,
    notification: "durable outbox; delivery verified separately",
  });
  await context.close();
}
try {
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM acceptance_sentinel"))
      .rows[0].n,
  ).toBe(1);
  expect(
    (
      await pool.query(
        "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
      )
    ).rows[0].n,
  ).toBe(55);
  expect((await stripe.balance.retrieve()).livemode).toBe(false);
  stage = "listener";
  await new Promise((resolve) => relay.listen(3451, "127.0.0.1", resolve));
  listener = spawn(
    env.T16_STRIPE_CLI_PATH ??
      "C:/Users/laich/Documents/hkwtia/.worktrees/audit-remediation/.tmp/audit-release/stripe-cli/stripe.exe",
    [
      "--config",
      env.T16_STRIPE_CONFIG_PATH ??
        "C:/Users/laich/Documents/hkwtia/.worktrees/audit-remediation/.playwright/audit-stripe-cli.toml",
      "--device-name",
      "hkwtia-audit-20260927",
      "listen",
      "--skip-update",
      "--events-from",
      "@self",
      "--events",
      "checkout.session.completed,checkout.session.async_payment_succeeded,checkout.session.expired,refund.created,refund.updated,refund.failed",
      "--forward-to",
      "http://127.0.0.1:3451/stripe",
    ],
    {
      env: { ...env, STRIPE_API_KEY: env.STRIPE_TEST_SECRET_KEY },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [listener.stdout, listener.stderr])
    stream.on("data", (data) => {
      const match = data.toString().match(/whsec_[A-Za-z0-9]+/);
      if (match) signingSecret = match[0];
    });
  await waitUntil(() => !!signingSecret, 45000);
  stage = "server";
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "localhost",
      "-p",
      "3450",
    ],
    {
      env: {
        ...env,
        STRIPE_WEBHOOK_SECRET: signingSecret,
        STRIPE_TEST_WEBHOOK_SECRET: signingSecret,
        APP_URL: base,
        VERCEL_ENV: "preview",
        EMAIL_FROM: "HKWTIA Acceptance <no-reply@example.test>",
        TICKET_PASS_TOKEN_SECRET: ticketPassSecret,
        CRON_SECRET: localCronSecret,
        NODE_OPTIONS: "--max-old-space-size=4096",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  evidence.runtimeDiagnostics = [];
  for (const stream of [server.stdout, server.stderr])
    stream.on("data", (data) => {
      const value = data.toString();
      const match = value.match(/(?:Error|TypeError): ([^\n]+)/);
      if (!match) return;
      let safe = match[1];
      for (const [key, v] of Object.entries({
        ...env,
        TICKET_PASS_TOKEN_SECRET: ticketPassSecret,
        CRON_SECRET: localCronSecret,
      }))
        if (v && /(SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL)/.test(key))
          safe = safe.replaceAll(v, "[redacted]");
      evidence.runtimeDiagnostics.push(
        safe.replace(/https?:\/\/[^\s]+/g, "[url]").slice(0, 160),
      );
    });
  await waitUntil(async () => {
    try {
      return (await fetch(base + "/")).ok;
    } catch {
      return false;
    }
  }, 45000);
  browser = await chromium.launch();
  if (env.T16_ASYNC_ONLY === "true") {
    evidence.scopeCases =
      "actual asynchronous refunds only; baseline payment/notice receipt retained separately";
    const staff = await isolatedBrowserContext();
    const admin = await staff.newPage();
    admin.setDefaultTimeout(45000);
    await admin.goto(base + "/admin-login");
    const login = await admin.request.post(base + "/api/auth/sign-in/email", {
      headers: { Origin: base },
      data: {
        email: env.M2_TEST_STAFF_EMAIL,
        password: env.M2_TEST_STAFF_PASSWORD,
        callbackURL: "/admin",
      },
    });
    expect(login.ok()).toBe(true);
    await verifyAsyncRefund(
      admin,
      "async-refund-success",
      "4000000000007726",
      "succeeded",
    );
    await verifyAsyncRefund(
      admin,
      "async-refund-failure",
      "4000000000005126",
      "failed",
    );
    evidence.completed = true;
    writeFileSync(
      "docs/audits/hkwtia-2026-10-01-remediation/evidence/t16/provider-async.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  } else {
    const context = await isolatedBrowserContext(),
      page = await context.newPage();
    page.setDefaultTimeout(45000);
    stage = "decline";
    const declined = await checkout(page, "decline", "4000000000000002");
    await page.locator("button[type=submit]").click();
    await expect(
      page.getByText(/Your card was declined|信用卡被拒/i),
    ).toBeVisible();
    expect((await snapshot(declined.id)).status).toBe("pending");
    await stripe.checkout.sessions.expire(declined.stripe_checkout_session_id);
    await waitUntil(() =>
      queue.some(
        (e) =>
          e.type === "checkout.session.expired" &&
          e.object.id === declined.stripe_checkout_session_id,
      ),
    );
    const expired = queue.find(
      (e) =>
        e.type === "checkout.session.expired" &&
        e.object.id === declined.stripe_checkout_session_id,
    );
    await forward(expired);
    expect((await snapshot(declined.id)).status).toBe("expired");
    evidence.steps.push({
      case: "decline and provider expiry",
      checkoutReference: mask(declined.stripe_checkout_session_id),
      result:
        "decline leaves pending/unpaid; actual signed expiry releases order",
    });
    stage = "paid-return-interrupted";
    const paidContext = await isolatedBrowserContext();
    const paidPage = await paidContext.newPage();
    const paid = await checkout(paidPage, "paid", "4242424242424242");
    await paidPage.route(
      "**/events/" + paid.slug + "?ticket=received",
      (route) => route.abort(),
    );
    await paidPage.locator("button[type=submit]").click();
    await waitUntil(
      async () =>
        (
          await stripe.checkout.sessions.retrieve(
            paid.stripe_checkout_session_id,
          )
        ).payment_status === "paid",
      90000,
    );
    await waitUntil(() =>
      queue.some(
        (e) =>
          e.type === "checkout.session.completed" &&
          e.object.id === paid.stripe_checkout_session_id,
      ),
    );
    expect((await snapshot(paid.id)).status).toBe("pending");
    const completed = queue.find(
      (e) =>
        e.type === "checkout.session.completed" &&
        e.object.id === paid.stripe_checkout_session_id,
    );
    await forward(completed);
    expect((await snapshot(paid.id)).status).toBe("paid");
    await forward(completed);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='event.order.paid'",
          [paid.id],
        )
      ).rows[0].n,
    ).toBe(1);
    evidence.paidNotices = await drainTestNotices(paid.id, [
      "confirmation",
      "pass",
    ]);
    evidence.paidNoticesReadback = (
      await pool.query(
        "SELECT kind,status,error_code,attempt_count,provider_id LIKE 'test:%' AS test_sink FROM ticket_email_outbox WHERE order_id=$1 ORDER BY kind",
        [paid.id],
      )
    ).rows;
    const seats = await pool.query(
      "SELECT id FROM event_order_seats WHERE order_id=$1",
      [paid.id],
    );
    expect(seats.rows).toHaveLength(1);
    evidence.steps.push({
      case: "paid with interrupted return, delayed signed event and replay",
      checkoutReference: mask(paid.stripe_checkout_session_id),
      paymentReference: mask(completed.object.payment_intent),
      orderReference: mask(paid.id),
      result:
        "provider paid while app pending; signed event -> paid; replay one audit/one seat",
    });
    stage = "staff-refund";
    const staff = await isolatedBrowserContext(),
      admin = await staff.newPage();
    await admin.goto(base + "/admin-login");
    const login = await admin.request.post(base + "/api/auth/sign-in/email", {
      headers: { Origin: base },
      data: {
        email: env.M2_TEST_STAFF_EMAIL,
        password: env.M2_TEST_STAFF_PASSWORD,
        callbackURL: "/admin",
      },
    });
    expect(login.ok()).toBe(true);
    await admin.goto(
      base + "/admin/events-mgmt/" + paid.eventId + "?tab=orders",
    );
    await expect(admin.getByText(paid.id, { exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Refund", exact: true }).click();
    await admin.getByRole("button", { name: "Refund", exact: true }).click();
    await expect(
      admin.getByRole("cell", { name: "Refunded", exact: true }),
    ).toBeVisible({ timeout: 60000 });
    expect((await snapshot(paid.id)).status).toBe("refunded");
    const intent =
      typeof completed.object.payment_intent === "string"
        ? completed.object.payment_intent
        : completed.object.payment_intent.id;
    const refunds = await stripe.refunds.list({ payment_intent: intent });
    expect(refunds.data).toHaveLength(1);
    expect(refunds.data[0].status).toBe("succeeded");
    expect(refunds.data[0].amount).toBe(1000);
    expect(refunds.data[0].currency).toBe("hkd");
    expect((await stripe.paymentIntents.retrieve(intent)).livemode).toBe(false);
    await admin.screenshot({
      path: ".playwright/t16-orders-en-desktop.png",
      fullPage: true,
    });
    await admin.goto(
      base + "/zh/admin/events-mgmt/" + paid.eventId + "?tab=orders",
    );
    await expect(
      admin.getByRole("cell", { name: "已退款", exact: true }),
    ).toBeVisible();
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.screenshot({
      path: ".playwright/t16-orders-zh-mobile.png",
      fullPage: true,
    });
    await waitUntil(() =>
      queue.some(
        (e) =>
          e.type.startsWith("refund.") &&
          e.object.metadata?.eventOrderId === paid.id,
      ),
    );
    for (const event of queue.filter(
      (e) =>
        e.type.startsWith("refund.") &&
        e.object.metadata?.eventOrderId === paid.id,
    ))
      await forward(event);
    expect(
      (
        await pool.query(
          "SELECT count(*)::int AS n FROM audit_events WHERE target_id=$1 AND action='event.order.refunded'",
          [paid.id],
        )
      ).rows[0].n,
    ).toBe(1);
    evidence.steps.push({
      case: "authorized staff refund and signed provider callback replay",
      refundReference: mask(refunds.data[0].id),
      result:
        "provider succeeded1000HKD cents, app refunded, one refund audit; translated order reference and status",
    });
    evidence.refundNotice = await drainTestNotices(paid.id, ["refund"]);
    evidence.outbox = (
      await pool.query(
        "SELECT kind,status,count(*)::int AS n FROM ticket_email_outbox WHERE order_id=$1 GROUP BY kind,status ORDER BY kind,status",
        [paid.id],
      )
    ).rows;
    await verifyAsyncRefund(
      admin,
      "async-refund-success",
      "4000000000007726",
      "succeeded",
    );
    await verifyAsyncRefund(
      admin,
      "async-refund-failure",
      "4000000000005126",
      "failed",
    );
    evidence.completed = true;
    mkdirSync("docs/audits/hkwtia-2026-10-01-remediation/evidence/t16", {
      recursive: true,
    });
    writeFileSync(
      "docs/audits/hkwtia-2026-10-01-remediation/evidence/t16/provider.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
  }
} catch (error) {
  evidence.completed = false;
  evidence.failedStage = stage;
  evidence.errorCode = error.code ?? error.name;
  let safeMessage = String(error.message ?? error.name).split("\n")[0];
  for (const [key, value] of Object.entries(env))
    if (value && /(SECRET|TOKEN|KEY|PASSWORD|DATABASE_URL)/.test(key))
      safeMessage = safeMessage.replaceAll(value, "[redacted]");
  evidence.errorMessage = safeMessage
    .replace(/https?:\/\/[^\s]+/g, "[url]")
    .slice(0, 160);
  writeFileSync(
    ".playwright/t16-provider-partial.json",
    JSON.stringify(evidence, null, 2),
  );
  if (browser) {
    try {
      const pages = browser.contexts().flatMap((c) => c.pages());
      await pages.at(-1)?.screenshot({
        path: ".playwright/t16-provider-failure.png",
        fullPage: true,
      });
    } catch {}
  }
  console.error(
    JSON.stringify({
      stage,
      errorCode: evidence.errorCode,
      errorMessage: evidence.errorMessage,
      verifiedSteps: evidence.steps.length,
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  server?.kill();
  listener?.kill();
  await new Promise((resolve) => relay.close(resolve));
  await pool.end();
}
