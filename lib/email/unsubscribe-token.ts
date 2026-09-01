import "server-only";

import {createHmac, timingSafeEqual} from "node:crypto";

import type {AppLocale} from "@/i18n/routing";

export type UnsubscribeTokenPayload = Readonly<{
  profileId: string;
  exp: number;
  locale: AppLocale;
}>;

function isPayload(value: unknown): value is UnsubscribeTokenPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.profileId === "string"
    && payload.profileId.length > 0
    && Number.isInteger(payload.exp)
    && (payload.locale === "en" || payload.locale === "zh-HK");
}

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function signUnsubscribeToken(
  payload: UnsubscribeTokenPayload,
  secret: string,
): string {
  if (!secret) throw new Error("UNSUBSCRIBE_SECRET_REQUIRED");
  if (!isPayload(payload)) throw new Error("INVALID_UNSUBSCRIBE_PAYLOAD");
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret).toString("base64url")}`;
}

/**
 * These links were signed with `CRON_SECRET` until the signing key was split
 * out, and they stay valid for `UNSUBSCRIBE_TTL_SECONDS` (30 days) after they
 * are minted. The last legacy token is minted by the final job run before the
 * deploy, so the fallback must outlive that by a margin.
 *
 * The clock starts at the deploy, not the commit -- named here so the date can
 * be rechecked rather than trusted. The split committed on 2026-08-06, but the
 * earliest production deployment carrying it is `e26cde88` (PR #10) at
 * 2026-08-09 14:32Z, so the last legacy token can stay valid until
 * 2026-09-08 14:32Z. This date sits about a day and a half past that, which is
 * the margin the paragraph above calls for -- the two are not meant to match,
 * and the gap is deliberate rather than arithmetic left unfinished.
 *
 * The deployment record is an upper bound: every production deployment on
 * record already carries the split, so the true stop can only be earlier, which
 * would only make removal safer. This constant read 2026-09-06 until
 * 2026-09-01, computed from the commit instead -- about three days early.
 *
 * After this date, delete `cronSecret` from the two `secrets` arrays
 * (`lib/api/unsubscribe-route.ts` and `app/[locale]/(public)/unsubscribe/page.tsx`)
 * and remove this constant. A test fails once the date passes, so this is not
 * left to memory.
 */
export const LEGACY_UNSUBSCRIBE_SECRET_SUNSET = "2026-09-10";

/**
 * Verifies against several keys in order, returning the first that matches.
 *
 * Array-shaped rather than `(primary, legacy)` because that is the shape any
 * future rotation needs too — a key can be added at the front and the old one
 * dropped from the back without touching a call site.
 */
export function verifyUnsubscribeTokenWithAny(
  token: string,
  secrets: readonly string[],
  now = Math.floor(Date.now() / 1000),
): UnsubscribeTokenPayload | null {
  for (const secret of [...new Set(secrets.filter(Boolean))]) {
    const payload = verifyUnsubscribeToken(token, secret, now);
    if (payload) return payload;
  }
  return null;
}

export function verifyUnsubscribeToken(
  token: string,
  secret: string,
  now = Math.floor(Date.now() / 1000),
): UnsubscribeTokenPayload | null {
  if (!secret || token.length === 0 || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;

  try {
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(encodedPayload, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!isPayload(payload) || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}
