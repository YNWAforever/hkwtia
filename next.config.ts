import type {NextConfig} from "next";
import createNextIntlPlugin from "next-intl/plugin";

import legacyUrls from "./content/legacy-urls.json";

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

/**
 * hkwtia.org is retiring after 25 years and this domain is taking its place.
 * Twenty-five years of inbound citations — government filings, press coverage
 * in 明報, 星島, 大公報, HK01, RTHK, search results — point at its URLs, and
 * every one of them 404s the moment DNS moves unless it redirects here.
 *
 * `content/legacy-urls.json` is the full, reviewable classification: 576
 * entries (the capture recorded 577; the home page "/" is excluded because a
 * "/" -> "/" rule would redirect the site to itself forever — see
 * tests/unit/redirects.test.ts for the guard).
 *
 * Most of those 576 share one of a handful of URL shapes and a single
 * destination each, so `legacyPatternRedirects` matches by shape instead of
 * enumerating — the /event/ bucket alone is 453 otherwise-identical entries.
 * `legacyLiteralRedirects` derives everything the patterns don't cover
 * straight from the fixture, so the two can never drift apart.
 *
 * `/events/:path*` is deliberately NOT a pattern here even though it would
 * compact four entries into one: the live app has a real `/events/[slug]`
 * route, and a wildcard on `/events/` would swallow every one of those pages
 * into this redirect. Those four legacy `/events...` urls are matched by
 * exact literal source instead, which cannot over-match.
 */
type LegacyRedirect = {source: string; destination: string; permanent: boolean};

const legacyPatternRedirects: LegacyRedirect[] = [
  // WordPress's tribe-events plugin: 453 individual event pages, /event/<slug>/.
  {source: "/event/:path*", destination: "/events", permanent: true},
  // Milestone posts, /YYYY/MM/<slug>/, 2001-2025 (61 urls). No per-item
  // destination exists yet, so all of them fall back to the about page.
  {source: "/:year(\\d{4})/:month(\\d{2})/:slug*", destination: "/about", permanent: true},
  {source: "/faq-items/:path*", destination: "/about", permanent: true},
  {source: "/faq_category/:path*", destination: "/about", permanent: true},
  {source: "/author/:path*", destination: "/news", permanent: true},
  {source: "/category/:path*", destination: "/news", permanent: true},
  {source: "/element_category/:path*", destination: "/", permanent: true},
];

// Must stay in sync with the prefixes matched by legacyPatternRedirects above —
// this is what keeps legacyLiteralRedirects from double-covering the same url.
function coveredByPattern(from: string): boolean {
  return (
    from.startsWith("/event/") ||
    /^\/\d{4}\/\d{2}\//.test(from) ||
    from.startsWith("/faq-items/") ||
    from.startsWith("/faq_category/") ||
    from.startsWith("/author/") ||
    from.startsWith("/category/") ||
    from.startsWith("/element_category/")
  );
}

const legacyLiteralRedirects: LegacyRedirect[] = legacyUrls.entries
  .filter((entry) => !coveredByPattern(entry.from))
  .map(({from, to}) => ({source: from, destination: to, permanent: true}));

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
      ...legacyPatternRedirects,
      ...legacyLiteralRedirects,
    ];
  },
};

export default withNextIntl(nextConfig);
