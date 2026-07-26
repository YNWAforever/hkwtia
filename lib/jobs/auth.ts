import {createHash, timingSafeEqual} from "node:crypto";

export function safeEqual(left: string, right: string): boolean {
  const leftDigest = createHash("sha256").update(left).digest();
  const rightDigest = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftDigest, rightDigest);
}

export function verifyCronBearer(
  request: Request,
  secret: string | null | undefined,
): boolean {
  if (typeof secret !== "string" || secret.trim().length === 0) return false;
  const authorization = request.headers.get("authorization");
  if (!authorization) return false;
  const match = /^Bearer ([^\s]+)$/.exec(authorization);
  return match !== null && safeEqual(match[1], secret);
}
