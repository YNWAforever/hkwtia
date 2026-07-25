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
