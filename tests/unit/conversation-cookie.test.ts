import {createHmac} from "node:crypto";

import {describe, expect, it} from "vitest";

import {
  CONCIERGE_OWNER_COOKIE,
  createAnonymousOwnership,
  hashAnonymousOwnerToken,
  resolveAnonymousOwnership,
} from "@/lib/ai/conversation-cookie";

const SECRET = "concierge-cookie-secret-that-is-at-least-32-bytes";

describe("anonymous Concierge ownership cookie", () => {
  it("stores only the random token in the cookie and an HMAC-SHA256 hash in persistence", () => {
    const random = Buffer.alloc(32, 7);
    const ownership = createAnonymousOwnership(SECRET, () => random);

    expect(CONCIERGE_OWNER_COOKIE).toBe("hkwtia_concierge_owner");
    expect(ownership.token).toBe(random.toString("base64url"));
    expect(ownership.ownerHash).toBe(
      createHmac("sha256", SECRET).update(ownership.token).digest("hex"),
    );
    expect(ownership.token).not.toContain(ownership.ownerHash);
    expect(ownership.cookie).toMatch(/^hkwtia_concierge_owner=[A-Za-z0-9_-]+;/);
    expect(ownership.cookie).toContain("HttpOnly");
    expect(ownership.cookie).toContain("Secure");
    expect(ownership.cookie).toContain("SameSite=Lax");
    expect(ownership.cookie).toContain("Path=/");
  });

  it("resolves a valid token to the same database ownership proof", () => {
    const created = createAnonymousOwnership(SECRET, () => Buffer.alloc(32, 9));

    expect(resolveAnonymousOwnership(created.token, SECRET)).toEqual({
      token: created.token,
      ownerHash: created.ownerHash,
    });
    expect(hashAnonymousOwnerToken(created.token, SECRET)).toBe(created.ownerHash);
  });

  it("turns a tampered token into a different owner proof and rejects malformed cookies", () => {
    const created = createAnonymousOwnership(SECRET, () => Buffer.alloc(32, 3));
    const tampered = `${created.token.slice(0, -1)}A`;

    expect(resolveAnonymousOwnership(tampered, SECRET)?.ownerHash)
      .not.toBe(created.ownerHash);
    expect(resolveAnonymousOwnership("not+base64url", SECRET)).toBeNull();
    expect(resolveAnonymousOwnership("short", SECRET)).toBeNull();
  });

  it.each(["", "short-secret"])(
    "fails closed for missing or short secret %j",
    (secret) => {
      expect(() => createAnonymousOwnership(secret)).toThrow(
        "CONCIERGE_COOKIE_SECRET_INVALID",
      );
      expect(() => resolveAnonymousOwnership("a".repeat(43), secret)).toThrow(
        "CONCIERGE_COOKIE_SECRET_INVALID",
      );
    },
  );
});
