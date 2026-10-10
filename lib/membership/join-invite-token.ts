import {createHash, randomBytes} from "node:crypto";

/**
 * Phase E join invites. The raw token exists only in the link staff send; the
 * database stores its SHA-256 digest, so a read of `join_invites` cannot mint a
 * working link. 32 random bytes is 256 bits, far past guessing, which is why a
 * plain unsalted digest is enough here (unlike a password).
 */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function digestInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function createInviteToken(): {token: string; digest: string} {
  const token = randomBytes(32).toString("base64url");
  return {token, digest: digestInviteToken(token)};
}

/**
 * The gate in front of every lookup: a value that is not exactly this shape
 * cannot be a token we minted, so it never reaches the database.
 */
export function isWellFormedInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
