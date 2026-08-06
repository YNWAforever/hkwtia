import type {NextConfig} from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * A deliberately partial Content-Security-Policy.
 *
 * Directives that are absent fall back to `default-src`, and no `default-src`
 * is declared — so each entry below restricts exactly what it names and nothing
 * else. That keeps this free of the white-screen risk a `script-src` carries
 * with next-intl's inline scripts, while making several properties the browser
 * enforces rather than ones our validators merely intend.
 *
 * - `img-src`        the site displays its own images only.
 * - `frame-ancestors` the reason this grew: without it the authenticated admin
 *                    approve, publish and reject forms are framable, and
 *                    clickjacking them needs no other bug.
 * - `base-uri`       never falls back to anything, so it is unrestricted until
 *                    named. A `<base>` tag injection would otherwise repoint
 *                    every relative script URL on the page.
 * - `object-src`     no plugin content anywhere on this site.
 * - `form-action`    every form here posts same-origin; Stripe is a redirect,
 *                    not a cross-origin form post.
 *
 * NOT set, deliberately:
 * - `script-src` / `default-src` — a useful policy needs a per-request nonce,
 *   which forces every page dynamic and defeats static caching. Its own change,
 *   staged report-only first.
 * - `Strict-Transport-Security` — Vercel already emits it, and `preload` is
 *   cached by browsers for up to two years and cannot be undone by a redeploy.
 *   It is the one header here that can outlive a mistake.
 */
const contentSecurityPolicy = [
  "img-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  {key: "Content-Security-Policy", value: contentSecurityPolicy},
  // Redundant with frame-ancestors on modern browsers, free on older ones.
  {key: "X-Frame-Options", value: "DENY"},
  // Load-bearing rather than boilerplate: the unsubscribe link carries its
  // token in the query string, and this stops that leaking via Referer.
  {key: "Referrer-Policy", value: "strict-origin-when-cross-origin"},
  {key: "X-Content-Type-Options", value: "nosniff"},
  {key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()"},
] as const;

/**
 * There is deliberately no `images` key. The defaults are already the safe
 * values — `remotePatterns: []`, `dangerouslyAllowSVG: false`,
 * `contentDispositionType: 'attachment'` — and since the media registry accepts
 * own-origin paths only, there is no remote host to allowlist. Writing an
 * `images` block here would only create somewhere to weaken them later, and an
 * allowlisted host cannot be constrained anyway: the optimizer checks
 * `remotePatterns` once while parsing the URL, then follows up to three
 * redirects without re-checking.
 */
const nextConfig: NextConfig = {
  async headers() {
    return [{source: "/:path*", headers: [...securityHeaders]}];
  },
  async redirects() {
    return [
      {source: "/projects", destination: "/programs/asa", permanent: true},
      {source: "/history", destination: "/about", permanent: true},
      {source: "/members", destination: "/showcase", permanent: false},
      {source: "/members/:id", destination: "/showcase", permanent: false},
    ];
  },
};

export default withNextIntl(nextConfig);
