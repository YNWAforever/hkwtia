const forbiddenCharacters = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;

function invalid(): never { throw new Error("HTTPS_URL_INVALID"); }

/**
 * The only clause a caller may relax. `allowQuery` keeps a query string and a
 * fragment, which a member's own organisation website legitimately carries (a
 * language variant, a landing page) — see `httpsUrlSchema` in
 * `lib/db/repos/company-profiles.ts`. Every other guarantee still holds, so a
 * caller that opts in cannot accidentally admit a deceptive host.
 */
export type HttpsUrlPolicy = Readonly<{allowQuery?: boolean}>;

/** Canonicalizes a strictly pre-normalized public HTTPS URL. It performs no I/O. */
export function canonicalHttpsUrl(input: unknown, policy: HttpsUrlPolicy = {}): string {
  if (typeof input !== "string") invalid();
  if (input !== input.trim() || input !== input.normalize("NFC")) invalid();
  const length = Array.from(input).length;
  if (length < 1 || length > 2048 || forbiddenCharacters.test(input)) invalid();
  // `new URL` elides a default port, so `:443` has to be caught in the raw
  // input. `?` and `#` end the authority as `/` does, and once `allowQuery`
  // lets them through they are the terminator `https://host:443?x=1` uses.
  if (/^https:\/\/[^/]+:\d+(?:[/?#]|$)/u.test(input)) invalid();
  let url: URL;
  try { url = new URL(input); } catch { invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) invalid();
  if (!policy.allowQuery && (url.search || url.hash)) invalid();
  const hostname = url.hostname.toLowerCase();
  const comparisonHostname = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (!hostname || hostname.endsWith(".") || comparisonHostname === "localhost" || comparisonHostname.endsWith(".localhost") || ipv4.test(comparisonHostname) || hostname.startsWith("[") || hostname.includes(":")) invalid();
  return url.href;
}
