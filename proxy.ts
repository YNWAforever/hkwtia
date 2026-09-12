import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
import createMiddleware from "next-intl/middleware";
import {
  handleAuthProxyRequest,
  NEON_AUTH_SESSION_COOKIE_NAME,
} from "@neondatabase/auth/server";

import {authEnv} from "@/lib/config/env";
import {routing} from "./i18n/routing";

/**
 * The query parameter Neon's hosted backend appends to `callbackURL` when it
 * redirects a verified magic link back to us (values look like `ml-<hex>`).
 *
 * Spelled out here because the SDK does not export the constant: it lives in
 * an internal chunk, reachable only through `processAuthMiddleware`, whose own
 * consumer (`exchangeOAuthToken`) additionally requires an OAuth
 * session-challenge cookie. That cookie is never issued for a magic-link
 * sign-in -- confirmed against production on 2026-09-12 by requesting a link
 * through both the Server Action and the SDK's own `/api/auth` proxy and
 * observing zero cookies on our origin either way -- so that path can never
 * fire for this flow, and the verifier would otherwise have no consumer at all.
 */
const NEON_AUTH_SESSION_VERIFIER_PARAM = "neon_auth_session_verifier";

export type NeonAuthExchangeRunner = (config: {
  request: NextRequest;
  path: string;
  baseUrl: string;
  cookieSecret: string;
  sessionDataTtl: number;
}) => Promise<Response>;

/**
 * Completes a magic-link sign-in.
 *
 * Neon verifies the emailed token on its own host, then redirects to our
 * `callbackURL` with a one-time verifier attached. That verifier is a promise
 * of a session, not a session: the real cookie has to be minted on *our*
 * origin, and only something that may write cookies can do it. A Server
 * Component may not, which is why `lib/auth/server.ts`'s `getSession` sends
 * `disableRefresh` and reads that failure as signed out -- so until this ran,
 * nothing completed the sign-in and `/member-login` re-rendered its own form
 * with a spent token still in the URL, indistinguishable from "stuck".
 *
 * Exchanging it means asking Neon for the session with the verifier on the
 * URL and relaying the `Set-Cookie` it answers with. Deliberately *not*
 * `processAuthMiddleware`: its exchange is gated on an OAuth challenge cookie
 * that magic-link sign-in never mints (see the constant above), and its own
 * route-protection verdict treats every path outside
 * `DEFAULT_AUTH_SKIP_ROUTES` as login-required -- which matches none of this
 * app's routes and would have put the whole public site behind a login wall.
 * Route protection stays where it already works: `/admin` hides behind
 * `notFound()`, `/portal` redirects from its own layout.
 *
 * Returns `null` -- leaving the request to ordinary routing -- whenever there
 * is nothing to exchange, and also when Neon declines to mint a session for
 * the verifier, so a refused exchange degrades to today's behaviour rather
 * than a redirect loop.
 */
export function createNeonAuthExchange(
  runExchange: NeonAuthExchangeRunner,
  resolveEnv: () => {neonAuthBaseUrl: string; neonAuthCookieSecret: string} = authEnv,
) {
  return async function neonAuthExchange(request: NextRequest): Promise<NextResponse | null> {
    if (!request.nextUrl.searchParams.has(NEON_AUTH_SESSION_VERIFIER_PARAM)) return null;
    // Already signed in: the verifier is a leftover on a shared or re-opened
    // link, and re-spending it would replace a good session with a worse one.
    if (request.cookies.has(NEON_AUTH_SESSION_COOKIE_NAME)) return null;

    let environment: {neonAuthBaseUrl: string; neonAuthCookieSecret: string};
    try {
      environment = resolveEnv();
    } catch {
      // A misconfigured Neon Auth pair must never take the site down; every
      // request passes through here.
      return null;
    }

    let cookies: readonly string[];
    try {
      const response = await runExchange({
        request,
        path: "get-session",
        baseUrl: environment.neonAuthBaseUrl,
        cookieSecret: environment.neonAuthCookieSecret,
        sessionDataTtl: 300,
      });
      cookies = response.ok ? response.headers.getSetCookie() : [];
    } catch {
      // An upstream outage must not turn the login page into an error page.
      return null;
    }
    // No cookie means no session was minted. Redirecting anyway would strip the
    // verifier and land the visitor on the same form having silently spent it.
    if (cookies.length === 0) return null;

    const redirectUrl = new URL(request.url);
    redirectUrl.searchParams.delete(NEON_AUTH_SESSION_VERIFIER_PARAM);
    const response = NextResponse.redirect(redirectUrl);
    for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
    return response;
  };
}

const neonAuthExchange = createNeonAuthExchange(
  ({request, ...config}) => handleAuthProxyRequest({request, ...config}),
);
const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  return (await neonAuthExchange(request)) ?? intlMiddleware(request);
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
