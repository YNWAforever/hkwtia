import type {NextRequest} from "next/server";
import {NextResponse} from "next/server";
import createMiddleware from "next-intl/middleware";
import {DEFAULT_AUTH_SKIP_ROUTES, processAuthMiddleware} from "@neondatabase/auth/server";

import {authEnv} from "@/lib/config/env";
import {routing} from "./i18n/routing";

export type NeonAuthExchangeResult =
  | Readonly<{action: "redirect_oauth"; redirectUrl: URL; cookies: readonly string[]}>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- passthrough shape from an external SDK; only `action` is ever read below
  | Readonly<{action: "allow" | "redirect_login"; [key: string]: any}>;

export type NeonAuthMiddlewareRunner = (config: {
  request: NextRequest;
  pathname: string;
  skipRoutes: readonly string[];
  loginUrl: string;
  baseUrl: string;
  cookieSecret: string;
}) => Promise<NeonAuthExchangeResult>;

/**
 * Never actually visited: exists only to satisfy `processAuthMiddleware`'s
 * required `loginUrl`, whose own "already at the login page, skip
 * protection" check runs BEFORE the verifier-exchange check below and would
 * otherwise short-circuit the exchange whenever the current request's path
 * happens to equal `loginUrl` -- which it does for the unprefixed (English)
 * locale, since `/member-login` is both this app's login form and its
 * `callbackURL` (`app/[locale]/member-login/actions.ts`'s
 * `buildMemberLoginCallback`). An off-origin placeholder can never match a
 * same-origin request path, so that bail-out never fires.
 */
const UNUSED_LOGIN_URL = "https://neon-auth-login-url.invalid/unused";

/**
 * Completes a pending Neon Auth session-verifier exchange: the second half
 * of the magic-link / OAuth callback. `auth.signIn.magicLink` (and OAuth
 * popups) redirect back to our `callbackURL` carrying a one-time
 * `neon_auth_session_verifier` token, which is a promise of a session, not a
 * session -- something has to exchange it for a real cookie. A Server
 * Component can't: it can't mutate cookies, which is why
 * `lib/auth/server.ts`'s `getSession` passes `disableRefresh: "true"` and
 * treats that failure mode as signed out. Until this ran, nothing ever
 * performed the exchange, so `/member-login` reads `getActor()` as `null`
 * forever and re-renders the login form with a spent, useless token still in
 * the URL -- indistinguishable from "stuck".
 *
 * Returns `null` for every other request, so this app's own per-route auth
 * keeps deciding what happens next: `/admin` hides behind `notFound()`
 * (`lib/admin/page-auth.ts`), `/portal` redirects via its own layout, and
 * `DEFAULT_AUTH_SKIP_ROUTES` (`/api/auth`, `/auth/sign-in`, ...) matches none
 * of this app's routes -- so the SDK's own "protect everything not
 * explicitly public" verdict (`redirect_login`) is deliberately ignored here
 * rather than adopted, which would otherwise redirect the entire public
 * site to a login wall the first time this ran.
 */
export function createNeonAuthExchange(
  runAuthMiddleware: NeonAuthMiddlewareRunner,
  resolveEnv: () => {neonAuthBaseUrl: string; neonAuthCookieSecret: string} = authEnv,
) {
  return async function neonAuthExchange(request: NextRequest): Promise<NextResponse | null> {
    let environment: {neonAuthBaseUrl: string; neonAuthCookieSecret: string};
    try {
      environment = resolveEnv();
    } catch {
      // A misconfigured Neon Auth pair must never take the whole site down;
      // every request on the site passes through here.
      return null;
    }
    const result = await runAuthMiddleware({
      request,
      pathname: request.nextUrl.pathname,
      skipRoutes: DEFAULT_AUTH_SKIP_ROUTES,
      loginUrl: UNUSED_LOGIN_URL,
      baseUrl: environment.neonAuthBaseUrl,
      cookieSecret: environment.neonAuthCookieSecret,
    });
    if (result.action !== "redirect_oauth") return null;
    const response = NextResponse.redirect(result.redirectUrl);
    for (const cookie of result.cookies) response.headers.append("Set-Cookie", cookie);
    return response;
  };
}

const neonAuthExchange = createNeonAuthExchange(processAuthMiddleware);
const intlMiddleware = createMiddleware(routing);

export default async function middleware(request: NextRequest): Promise<NextResponse> {
  return (await neonAuthExchange(request)) ?? intlMiddleware(request);
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
