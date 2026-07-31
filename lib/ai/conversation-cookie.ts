import {createHmac, randomBytes, timingSafeEqual} from "node:crypto";

export const CONCIERGE_OWNER_COOKIE = "hkwtia_concierge_owner";
const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export type AnonymousOwnership = Readonly<{
  token: string;
  ownerHash: string;
  cookie: string;
}>;

function checkedSecret(secret: string): string {
  if (
    typeof secret !== "string"
    || Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error("CONCIERGE_COOKIE_SECRET_INVALID");
  }
  return secret;
}

export function hashAnonymousOwnerToken(
  token: string,
  secret: string,
): string {
  checkedSecret(secret);
  if (!TOKEN_PATTERN.test(token)) {
    throw new Error("CONCIERGE_OWNER_TOKEN_INVALID");
  }
  return createHmac("sha256", secret).update(token, "utf8").digest("hex");
}

export function createAnonymousOwnership(
  secret: string,
  random: () => Buffer = () => randomBytes(TOKEN_BYTES),
): AnonymousOwnership {
  checkedSecret(secret);
  const bytes = random();
  if (!Buffer.isBuffer(bytes) || bytes.byteLength !== TOKEN_BYTES) {
    throw new Error("CONCIERGE_OWNER_RANDOM_INVALID");
  }
  const token = bytes.toString("base64url");
  const ownerHash = hashAnonymousOwnerToken(token, secret);
  return Object.freeze({
    token,
    ownerHash,
    cookie: [
      `${CONCIERGE_OWNER_COOKIE}=${token}`,
      "Path=/",
      `Max-Age=${COOKIE_MAX_AGE_SECONDS}`,
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
    ].join("; "),
  });
}

export function resolveAnonymousOwnership(
  token: string | null | undefined,
  secret: string,
): Readonly<{token: string; ownerHash: string}> | null {
  checkedSecret(secret);
  if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;
  return Object.freeze({
    token,
    ownerHash: hashAnonymousOwnerToken(token, secret),
  });
}

export function anonymousOwnerHashesMatch(
  left: string,
  right: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(left) || !/^[a-f0-9]{64}$/.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}
