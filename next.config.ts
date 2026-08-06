import type {NextConfig} from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/**
 * Deliberately image-scoped, not a full policy.
 *
 * `img-src` alone restricts images and nothing else: directives that are absent
 * fall back to `default-src`, and with no `default-src` declared, scripts,
 * styles and connections stay unrestricted. That keeps this change free of the
 * white-screen risk a `script-src` carries with next-intl's inline scripts,
 * while making "the site only displays its own images" a property the browser
 * enforces rather than one the media validator merely intends.
 *
 * A full Content-Security-Policy — script-src, style-src, frame-ancestors and
 * the rest — is still missing from this repo and is worth its own change, with
 * its own verification against a production build.
 */
const imageContentSecurityPolicy = "img-src 'self' data:";

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
    return [{
      source: "/:path*",
      headers: [{key: "Content-Security-Policy", value: imageContentSecurityPolicy}],
    }];
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
