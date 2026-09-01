/**
 * URL rules for anything that becomes an image.
 *
 * Two rules live here because they guard two different sinks:
 *
 * - `isRegistrableMediaUrl` guards a *render* target. The browser resolves it,
 *   so it must be own-origin: a site-relative path and nothing else.
 * - `hasUrlObfuscation` is the shared primitive both rules need, because
 *   `new URL()` silently repairs input that a naive prefix check reads as
 *   site-relative. `"/\\evil.example.com/x.png"` and a tab-separated
 *   `"/<TAB>/evil.example.com/x.png"` both start with `/`, and both resolve to
 *   `https://evil.example.com/x.png`.
 */

/**
 * True for a backslash or any C0 control character or DEL. The WHATWG parser
 * maps `\` to `/` and strips tab, LF and CR from anywhere in the input, while
 * zod's `.trim()` only removes them from the ends — so an interior one
 * survives validation and then changes which host the URL points at.
 *
 * Written as a code-point scan rather than a character-class regex so the
 * control range is legible in source instead of being invisible bytes.
 */
export function hasUrlObfuscation(value: string): boolean {
  if (value.includes("\\")) return true;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Formats `next/image` will actually serve under this repo's config. */
const renderableExtension = /\.(?:png|jpe?g|webp|avif)$/i;
const privateMediaDeliveryPath = /^\/api\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Uploaded media must bypass Next's optimizer so every browser request reaches
 * the revocation and integrity checks on `/api/media/[id]`. The exact path
 * shape prevents this exception from becoming a generic optimizer escape.
 */
export function isPrivateMediaDeliveryUrl(value: string): boolean {
  return privateMediaDeliveryPath.test(value);
}

/**
 * A reference the site may render as an image.
 *
 * Own-origin only. An allowlist of third-party hosts cannot be made safe here:
 * Next's optimizer checks `remotePatterns` once while parsing the URL and then
 * follows up to three redirects without re-checking, so allowlisting a host
 * you do not control is equivalent to allowlisting every host. Rendering
 * remote images in the browser instead would move the fetch to the visitor and
 * leak their IP, user agent and referer to member-operated infrastructure.
 */
export function isRegistrableMediaUrl(value: string): boolean {
  if (value !== value.trim()) return false;
  if (hasUrlObfuscation(value)) return false;
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  // `..` cannot escape the origin, but it defeats any reading of the stored
  // value, and a query string is rejected by the default `localPatterns`.
  if (value.includes("?") || value.includes("#") || value.includes("..")) return false;
  // SVG is excluded deliberately: `dangerouslyAllowSVG` is false, so the
  // optimizer returns 400 for one, and an SVG served from our own origin is a
  // script-execution surface rather than a picture.
  return renderableExtension.test(value);
}
