/**
 * First-touch sign-up source.
 *
 * The cookie is set once, on the first document navigation, and is not refreshed.
 * It stores campaign parameters, an optional `ref` code, the external referrer
 * host, and the landing path. It does not store the query string, the full
 * referrer URL, or an email address. Ninety days is long enough to cover a
 * join that starts from a campaign and finishes later, and short enough that
 * a stale campaign does not follow someone indefinitely.
 *
 * Migration `drizzle/0070_signup_attribution.sql` must be applied before a
 * deploy that writes these fields. The columns are part of the row select.
 */

export const ATTRIBUTION_COOKIE = "wtia_touch";
export const ATTRIBUTION_TTL_SECONDS = 90 * 24 * 60 * 60;

const TOKEN_MAX = 80;
const HEARD_MAX = 200;
const PATH_MAX = 200;
const HOST_MAX = 253;

export type FirstTouch = Readonly<{
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  referralCode: string | null;
  referrerHost: string | null;
  landingPath: string | null;
}>;

const EMPTY_TOUCH: FirstTouch = {
  utmSource: null,
  utmMedium: null,
  utmCampaign: null,
  utmTerm: null,
  utmContent: null,
  referralCode: null,
  referrerHost: null,
  landingPath: null,
};

function cleanToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TOKEN_MAX) return null;
  if (trimmed.includes("@") || /[\s/?#\\<>]/.test(trimmed) || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

export function cleanHeardAbout(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!trimmed) return null;
  if (trimmed.length > HEARD_MAX) return null;
  return trimmed;
}

export function heardAboutTooLong(value: unknown): boolean {
  if (typeof value !== "string") return false;
  return value.replace(/[\u0000-\u001F\u007F]/g, "").trim().length > HEARD_MAX;
}

function landingPath(pathname: string): string | null {
  if (!pathname.startsWith("/") || pathname.length > PATH_MAX) return null;
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("?") || pathname.includes("#")) return null;
  if (/[\u0000-\u001F\u007F]/.test(pathname)) return null;
  return pathname;
}

function referrerHost(referrer: string | null, ownHost: string): string | null {
  if (!referrer) return null;
  let url: URL;
  try { url = new URL(referrer); }
  catch { return null; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  const host = url.hostname.replace(/\.$/, "").toLowerCase();
  if (!host || host.length > HOST_MAX || host === ownHost.toLowerCase()) return null;
  if (host.includes("@") || /[\s/]/.test(host)) return null;
  return host;
}

export function captureFirstTouch(input: Readonly<{
  href: string;
  referrer: string | null;
}>): FirstTouch {
  let url: URL;
  try { url = new URL(input.href); }
  catch { return EMPTY_TOUCH; }
  return {
    utmSource: cleanToken(url.searchParams.get("utm_source")),
    utmMedium: cleanToken(url.searchParams.get("utm_medium")),
    utmCampaign: cleanToken(url.searchParams.get("utm_campaign")),
    utmTerm: cleanToken(url.searchParams.get("utm_term")),
    utmContent: cleanToken(url.searchParams.get("utm_content")),
    referralCode: cleanToken(url.searchParams.get("ref")),
    referrerHost: referrerHost(input.referrer, url.hostname),
    landingPath: landingPath(url.pathname),
  };
}

export function encodeFirstTouch(touch: FirstTouch): string {
  const bytes = new TextEncoder().encode(JSON.stringify(touch));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function decodeFirstTouch(value: string | undefined): FirstTouch | null {
  if (!value || value.length > 1500) return null;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<FirstTouch>;
    const touch: FirstTouch = {
      utmSource: cleanToken(parsed.utmSource),
      utmMedium: cleanToken(parsed.utmMedium),
      utmCampaign: cleanToken(parsed.utmCampaign),
      utmTerm: cleanToken(parsed.utmTerm),
      utmContent: cleanToken(parsed.utmContent),
      referralCode: cleanToken(parsed.referralCode),
      referrerHost: cleanToken(parsed.referrerHost) && parsed.referrerHost && parsed.referrerHost.length <= HOST_MAX
        ? parsed.referrerHost.toLowerCase()
        : null,
      landingPath: typeof parsed.landingPath === "string" ? landingPath(parsed.landingPath) : null,
    };
    if (touch.referrerHost && (touch.referrerHost.includes("..") || !touch.referrerHost.includes(".") && touch.referrerHost !== "localhost")) {
      return {...touch, referrerHost: touch.referrerHost === "localhost" ? "localhost" : null};
    }
    return touch;
  } catch {
    return null;
  }
}

export function isDocumentNavigation(headers: Headers, method: string): boolean {
  if (method !== "GET") return false;
  if (headers.get("next-router-prefetch") === "1") return false;
  if (headers.get("purpose") === "prefetch" || headers.get("sec-purpose")?.includes("prefetch")) return false;
  if (headers.get("rsc") === "1") return false;
  return true;
}

export function firstTouchCookieHeader(touch: FirstTouch, secure: boolean): string {
  const parts = [
    `${ATTRIBUTION_COOKIE}=${encodeFirstTouch(touch)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${ATTRIBUTION_TTL_SECONDS}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
