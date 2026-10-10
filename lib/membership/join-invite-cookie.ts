import "server-only";

import {cookies} from "next/headers";
import {z} from "zod";

import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";

/**
 * The invite id is a bearer credential for the attributed join, so it travels only in this
 * httpOnly cookie: never in a URL, a form field, rendered HTML or a client component's props.
 * The public link carries the opaque token; the id appears after the `continue` route has
 * exchanged one for the other.
 */
export const INVITE_COOKIE_NAME = "wtia_invite";

const uuidSchema = z.string().uuid();

export function inviteCookieOptions(expiresAt: Date) {
  return {httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: expiresAt} as const;
}

/** The invite id from the cookie, or null when absent or not a uuid. */
export async function readInviteCookie(): Promise<string | null> {
  const value = (await cookies()).get(INVITE_COOKIE_NAME)?.value;
  const parsed = uuidSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

// The token is 256 bits, so this is not about guessing; it keeps a scripted client from turning the
// public page into a free `opened_at` stamper. Process-local, like the other public limiters.
const limiter = createInMemoryRateLimiter({limit: 20, windowMs: 60_000});

/**
 * True when this caller is still within 20 views a minute. Keyed by the platform-set client IP
 * (`clientIpFromHeaders`), never `x-forwarded-for`, which a client can rotate to dodge the bucket.
 */
export function inviteOpenAllowed(headers: Headers): boolean {
  return limiter.check(`join-invite:${clientIpFromHeaders(headers) ?? "unknown"}`).allowed;
}
