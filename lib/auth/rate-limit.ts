import "server-only";

import {createHash} from "node:crypto";

import {createInMemoryRateLimiter, type RateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";

/**
 * Rate limits the outbound-email and credential-guessing auth endpoints.
 *
 * The magic-link send is reachable by TWO independent paths that do not share a
 * chokepoint:
 *
 *  1. `POST /api/auth/sign-in/magic-link`, served by our own catch-all route
 *     (`proxy.ts` excludes `api`, so middleware never sees it).
 *  2. The `/join` Server Action, which calls `auth.signIn.magicLink(...)`. That
 *     goes through the provider's `fetchWithAuth`, which builds
 *     `new URL(path, NEON_AUTH_BASE_URL)` and fetches the upstream service
 *     directly — it never touches our route.
 *
 * So the guard lives here and both callers use it. Guarding only the route
 * would leave `/join` open; guarding only `/join` would leave the raw endpoint
 * open, and that one needs no session at all.
 *
 * WHAT THIS BUYS. `createInMemoryRateLimiter` is process-local, so on Vercel
 * the real ceiling is `limit x concurrent instances`. It stops a naive script
 * and accidental retry storms, and it gives the correct check one named home.
 * It does not bound sends fleet-wide against a distributed or deliberately
 * paced sender — that needs a shared store, which is out of scope here.
 */

/** Endpoints that mail an address the caller chooses. */
const emailSendPaths: ReadonlySet<string> = new Set([
  "sign-in/magic-link",
  "sign-in/email-otp",
  "sign-up/email",
  "email-otp/send-verification-otp",
]);

/** Endpoints where a wrong guess is cheap and repeatable. */
const credentialPaths: ReadonlySet<string> = new Set([
  "sign-in/email",
  "email-otp/check-verification-otp",
  "email-otp/verify-email",
]);

// Only used to find an address; the provider owns the real parsing. The cap
// exists so a hostile body is never buffered by our clone.
const MAX_BODY_BYTES = 8_192;

// The per-address bucket is what protects a victim: an attacker rotates source
// IPs far more easily than the target inbox.
function createDefaultLimiters() {
  return {
    email: createInMemoryRateLimiter({limit: 3, windowMs: 15 * 60_000}),
    sendIp: createInMemoryRateLimiter({limit: 10, windowMs: 60 * 60_000}),
    credential: createInMemoryRateLimiter({limit: 20, windowMs: 5 * 60_000}),
  };
}

let defaults = createDefaultLimiters();

/**
 * Test-only. These buckets are module-scope, so a suite that exercises several
 * sends would otherwise exhaust them and fail later cases for the wrong reason.
 */
export function resetAuthRateLimits(): void {
  defaults = createDefaultLimiters();
}

export type AuthRateLimitDependencies = Readonly<{
  emailLimiter?: RateLimiter;
  sendIpLimiter?: RateLimiter;
  credentialLimiter?: RateLimiter;
}>;

export type AuthSendDecision = Readonly<{allowed: boolean; retryAfterSeconds: number}>;

const ALLOWED: AuthSendDecision = {allowed: true, retryAfterSeconds: 0};

/** Hashed so neither the in-process map nor a future log line holds an address. */
function emailBucket(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

/**
 * The shared decision both entrypoints make. A missing IP shares one `unknown`
 * bucket rather than being denied or waved through: on Vercel
 * `x-vercel-forwarded-for` is always present, so `unknown` only ever collects
 * local development, where denying would break `/join` for no security gain.
 */
export function checkAuthSend(
  input: Readonly<{ip: string | null; email: string | null}>,
  dependencies: AuthRateLimitDependencies = {},
): AuthSendDecision {
  // IP first: an attacker rotating addresses from one source burns their own
  // quota before they ever reach a second inbox.
  const byIp = (dependencies.sendIpLimiter ?? defaults.sendIp)
    .check(`auth:send:ip:${input.ip ?? "unknown"}`);
  if (!byIp.allowed) return {allowed: false, retryAfterSeconds: byIp.retryAfterSeconds};

  if (!input.email) return ALLOWED;
  const byEmail = (dependencies.emailLimiter ?? defaults.email)
    .check(`auth:send:email:${emailBucket(input.email)}`);
  return byEmail.allowed
    ? ALLOWED
    : {allowed: false, retryAfterSeconds: byEmail.retryAfterSeconds};
}

/** `/api/auth/sign-in/magic-link` -> `sign-in/magic-link`. */
export function authPathOf(url: string): string | null {
  try {
    const {pathname} = new URL(url, "http://localhost");
    const marker = "/api/auth/";
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    return pathname.slice(index + marker.length).replace(/\/+$/, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

async function emailFrom(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return null;
  try {
    // Cloned so the provider handler still receives an unread body.
    const body: unknown = await request.clone().json();
    if (!body || typeof body !== "object") return null;
    const value = (body as {email?: unknown}).email;
    if (typeof value !== "string") return null;
    const email = value.trim();
    return email.length > 0 && email.length <= 320 ? email : null;
  } catch {
    return null;
  }
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    {error: "RATE_LIMITED"},
    {status: 429, headers: {"retry-after": String(retryAfterSeconds), "cache-control": "no-store"}},
  );
}

/**
 * Returns a 429 when the request should be refused, or null to let the provider
 * handler run untouched. Paths outside the two sets above pass straight
 * through, so sign-out, session reads and social sign-in are unaffected.
 */
export async function rateLimitAuthRequest(
  request: Request,
  dependencies: AuthRateLimitDependencies = {},
): Promise<Response | null> {
  const path = authPathOf(request.url);
  if (path === null) return null;

  const ip = clientIpFromHeaders(request.headers);

  if (credentialPaths.has(path)) {
    const limit = (dependencies.credentialLimiter ?? defaults.credential)
      .check(`auth:credential:${ip ?? "unknown"}`);
    return limit.allowed ? null : tooManyRequests(limit.retryAfterSeconds);
  }

  if (!emailSendPaths.has(path)) return null;

  const decision = checkAuthSend({ip, email: await emailFrom(request)}, dependencies);
  return decision.allowed ? null : tooManyRequests(decision.retryAfterSeconds);
}
