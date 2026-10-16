import "server-only";

import {createHash} from "node:crypto";
import {rateLimitRepository, type SharedRateLimitInput} from "@/lib/db/repos/rate-limit";
import {createSharedRateLimiter} from "@/lib/security/shared-rate-limit";

import type {RateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {BoundedBodyError, readBoundedBytes} from "@/lib/security/bounded-body";

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
 * The default path uses the existing PostgreSQL rate_limit_buckets store.
 * Test-only injected in-memory limiters preserve focused parser tests; they are
 * never the deployed default. Shared-store failures deny outbound effects.
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

// The per-address bucket protects the recipient when a sender rotates IPs.
export type AuthRateLimitDependencies = Readonly<{
  emailLimiter?: RateLimiter;
  sendIpLimiter?: RateLimiter;
  credentialLimiter?: RateLimiter;
  store?: Pick<typeof rateLimitRepository, "consumeRateLimit">;
  secret?: string;
  now?: () => Date;
}>;

export type AuthSendDecision = Readonly<{allowed: boolean; retryAfterSeconds: number; unavailable?: true}>;

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
async function checkScope(
  scope: Extract<SharedRateLimitInput["scope"], `auth-${string}`>,
  rawKey: string,
  dependencies: AuthRateLimitDependencies,
  injected?: RateLimiter,
): Promise<AuthSendDecision> {
  try {
    if (injected) return injected.check(rawKey);
    return await createSharedRateLimiter(
      scope, dependencies.secret ?? process.env.RATE_LIMIT_KEY_SECRET ?? "",
      dependencies.store ?? rateLimitRepository, dependencies.now,
    ).check(rawKey);
  } catch {
    return {allowed: false, retryAfterSeconds: 0, unavailable: true};
  }
}

export async function checkAuthSend(
  input: Readonly<{ip: string | null; email: string | null}>,
  dependencies: AuthRateLimitDependencies = {},
): Promise<AuthSendDecision> {
  // IP first: rotating addresses from one source spends that source's quota.
  const byIp = await checkScope("auth-send-ip", `auth:send:ip:${input.ip ?? "unknown"}`, dependencies, dependencies.sendIpLimiter);
  if (!byIp.allowed) return byIp;
  if (!input.email) return ALLOWED;
  return checkScope("auth-send-email", `auth:send:email:${emailBucket(input.email)}`, dependencies, dependencies.emailLimiter);
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

type EmailBody = Readonly<{email: string | null; tooLarge: boolean}>;

async function emailFrom(request: Request): Promise<EmailBody> {
  let bytes: Uint8Array;
  try {
    bytes = await readBoundedBytes(request.clone(), MAX_BODY_BYTES);
  } catch (error) {
    return {email: null, tooLarge: error instanceof BoundedBodyError};
  }
  try {
    const body: unknown = JSON.parse(new TextDecoder("utf-8", {fatal: true}).decode(bytes));
    if (!body || typeof body !== "object") return {email: null, tooLarge: false};
    const value = (body as {email?: unknown}).email;
    if (typeof value !== "string") return {email: null, tooLarge: false};
    const email = value.trim();
    return {email: email.length > 0 && email.length <= 320 ? email : null, tooLarge: false};
  } catch {
    return {email: null, tooLarge: false};
  }
}

function tooManyRequests(retryAfterSeconds: number): Response {
  return Response.json(
    {error: "RATE_LIMITED"},
    {status: 429, headers: {"retry-after": String(retryAfterSeconds), "cache-control": "no-store"}},
  );
}

function limiterUnavailable(): Response {
  return Response.json({error: "LIMITER_UNAVAILABLE"}, {status: 503, headers: {"cache-control": "no-store", "retry-after": "30"}});
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
    const limit = await checkScope("auth-credential-ip", `auth:credential:${ip ?? "unknown"}`, dependencies, dependencies.credentialLimiter);
    return limit.allowed ? null : limit.unavailable ? limiterUnavailable() : tooManyRequests(limit.retryAfterSeconds);
  }

  if (!emailSendPaths.has(path)) return null;

  const body = await emailFrom(request);
  if (body.tooLarge) {
    return Response.json({error: "PAYLOAD_TOO_LARGE"}, {status: 413, headers: {"cache-control": "no-store"}});
  }
  const decision = await checkAuthSend({ip, email: body.email}, dependencies);
  return decision.allowed ? null : decision.unavailable ? limiterUnavailable() : tooManyRequests(decision.retryAfterSeconds);
}
