import {describe, expect, it} from "vitest";

import {createInviteToken, digestInviteToken, isWellFormedInviteToken} from "@/lib/membership/join-invite-token";

describe("join invite token", () => {
  it("mints a 43-char base64url token and a 64-char sha-256 hex digest", () => {
    const {token, digest} = createInviteToken();
    expect(token).toHaveLength(43);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digestInviteToken(token)).toBe(digest);
    expect(digest).not.toContain(token);
  });

  it("never mints the same token twice", () => {
    expect(createInviteToken().token).not.toBe(createInviteToken().token);
  });

  it("accepts only the exact token shape", () => {
    const {token} = createInviteToken();
    expect(isWellFormedInviteToken(token)).toBe(true);
    for (const bad of ["not-a-token", "", token.slice(1), `${token}A`, `${token.slice(1)}+`, null, undefined, 42, {}]) {
      expect(isWellFormedInviteToken(bad)).toBe(false);
    }
  });
});
