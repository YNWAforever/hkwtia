const forbiddenCharacters = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;
const ipv4 = /^(?:\d{1,3}\.){3}\d{1,3}$/u;

function invalid(): never { throw new Error("HTTPS_URL_INVALID"); }

/** Canonicalizes a strictly pre-normalized public HTTPS URL. It performs no I/O. */
export function canonicalHttpsUrl(input: unknown): string {
  if (typeof input !== "string") invalid();
  if (input !== input.trim() || input !== input.normalize("NFC")) invalid();
  const length = Array.from(input).length;
  if (length < 1 || length > 2048 || forbiddenCharacters.test(input)) invalid();
  if (/^https:\/\/[^/]+:\d+(?:\/|$)/u.test(input)) invalid();
  let url: URL;
  try { url = new URL(input); } catch { invalid(); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) invalid();
  const hostname = url.hostname.toLowerCase();
  const comparisonHostname = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (!hostname || hostname.endsWith(".") || comparisonHostname === "localhost" || comparisonHostname.endsWith(".localhost") || ipv4.test(comparisonHostname) || hostname.startsWith("[") || hostname.includes(":")) invalid();
  return url.href;
}
