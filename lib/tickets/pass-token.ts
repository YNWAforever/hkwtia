import "server-only";

import {createHmac, timingSafeEqual} from "node:crypto";

/** Bump to invalidate every outstanding pass deliberately, at a rotation. */
export const PASS_TOKEN_VERSION = 1;

export type PassClaims = Readonly<{seatId: string; eventId: string}>;
type SignedClaims = PassClaims & Readonly<{v: number}>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isSignedClaims(value: unknown): value is SignedClaims {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return typeof payload.seatId === "string" && uuidPattern.test(payload.seatId)
    && typeof payload.eventId === "string" && uuidPattern.test(payload.eventId)
    && Number.isInteger(payload.v);
}

function signature(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function signPassToken(claims: PassClaims, secret: string, version: number = PASS_TOKEN_VERSION): string {
  if (!secret) throw new Error("TICKET_PASS_SECRET_REQUIRED");
  if (!uuidPattern.test(claims.seatId) || !uuidPattern.test(claims.eventId)) throw new Error("INVALID_PASS_CLAIMS");
  const payload: SignedClaims = {v: version, seatId: claims.seatId, eventId: claims.eventId};
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encodedPayload}.${signature(encodedPayload, secret).toString("base64url")}`;
}

/**
 * `null` for anything doubtful —a bad signature, a stale version, a malformed
 * body, an over-long token. Callers treat `null` as "no such pass" and 404.
 */
export function verifyPassToken(token: string, secret: string): SignedClaims | null {
  if (!secret || token.length === 0 || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [encodedPayload, encodedSignature] = parts;

  try {
    const supplied = Buffer.from(encodedSignature, "base64url");
    const expected = signature(encodedPayload, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    if (!isSignedClaims(payload) || payload.v !== PASS_TOKEN_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}
