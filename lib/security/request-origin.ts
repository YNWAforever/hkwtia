import {isIP} from "node:net";

function canonicalOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "https:" && url.protocol !== "http:")
      || url.username
      || url.password
      || url.pathname !== "/"
      || url.search
      || url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function isSameOrigin(request: Request, expectedOrigin: string): boolean {
  const expected = canonicalOrigin(expectedOrigin);
  const supplied = request.headers.get("origin");
  if (!expected || !supplied) return false;
  return canonicalOrigin(supplied) === expected;
}

function singleIp(value: string | null): string | null {
  if (!value || value.includes(",") || value.trim() !== value) return null;
  return isIP(value) === 0 ? null : value;
}

/**
 * Accept only headers overwritten by the deployment proxy. Generic
 * x-forwarded-for is deliberately ignored because clients can author it.
 */
export function clientIpFromHeaders(headers: Headers): string | null {
  const vercelForwardedFor = headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor !== null) return singleIp(vercelForwardedFor);
  return singleIp(headers.get("x-real-ip"));
}
