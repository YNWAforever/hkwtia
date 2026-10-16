import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {
  signUnsubscribeToken,
  verifyUnsubscribeToken,
  verifyUnsubscribeTokenWithAny,
} from "@/lib/email/unsubscribe-token";

const current = "unsubscribe-token-secret-at-least-32-bytes";
const legacy = "cron-secret-at-least-thirty-two-bytes-x";
const unrelated = "some-other-secret-at-least-32-bytes-long";

function token(secret: string) {
  return signUnsubscribeToken(
    {profileId: "profile-1", locale: "en", exp: Math.floor(Date.now() / 1000) + 3_600},
    secret,
  );
}

describe("unsubscribe secret rotation", () => {
  it("accepts a link signed with the legacy key while the fallback stands", () => {
    expect(verifyUnsubscribeTokenWithAny(token(legacy), [current, legacy]))
      .toMatchObject({profileId: "profile-1"});
  });

  it("accepts a link signed with the new key", () => {
    expect(verifyUnsubscribeTokenWithAny(token(current), [current, legacy]))
      .toMatchObject({profileId: "profile-1"});
  });

  it("rejects a link signed with neither", () => {
    expect(verifyUnsubscribeTokenWithAny(token(unrelated), [current, legacy])).toBeNull();
  });

  it("stops accepting legacy links once the fallback is dropped", () => {
    expect(verifyUnsubscribeTokenWithAny(token(legacy), [current])).toBeNull();
  });

  it.each([
    ["an empty secret in the list", ["", current]],
    ["a duplicated secret", [current, current]],
    ["an empty list", [] as readonly string[]],
  ])("tolerates %s", (_case, secrets) => {
    const result = verifyUnsubscribeTokenWithAny(token(current), secrets);
    expect(result === null || result.profileId === "profile-1").toBe(true);
  });

  it("still honours expiry across every key", () => {
    const expired = signUnsubscribeToken(
      {profileId: "profile-1", locale: "en", exp: Math.floor(Date.now() / 1000) - 1},
      legacy,
    );

    expect(verifyUnsubscribeTokenWithAny(expired, [current, legacy])).toBeNull();
    expect(verifyUnsubscribeToken(expired, legacy)).toBeNull();
  });
});

describe("the split is real, not aliased", () => {
  /**
   * The minting module, wherever it lives. It was `lib/jobs/runners.ts` until
   * Phase C2 Task 11 moved `unsubscribeUrls` to a leaf so the notifications
   * dispatcher could mint the same pair without importing the runner module —
   * `runners.ts` re-exports the name, which is exactly the aliasing this guard
   * has to see through. Anchored on the module that calls
   * `signUnsubscribeToken`, so the next move re-points one constant rather than
   * quietly retiring the assertion.
   */
  const SIGNING_MODULE = "lib/email/unsubscribe-urls.ts";

  it("signs with the dedicated secret and never with the cron bearer", () => {
    const source = readFileSync(resolve(process.cwd(), SIGNING_MODULE), "utf8");

    // The module that mints is the module that must read the dedicated secret.
    expect(source).toContain("signUnsubscribeToken");
    // Matched on the property name rather than a particular accessor
    // expression, so narrowing `serverEnv()` to a feature-scoped contract
    // stays a refactor instead of silently retiring this guard.
    expect(source).toMatch(/\bunsubscribeTokenSecret\b/);
    // If signing were merely aliased, a leaked bearer would still mint tokens.
    expect(source).not.toContain("cronSecret");
  });

  it("leaves no second minting path behind in the job runners", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/jobs/runners.ts"), "utf8");

    expect(source).not.toContain("signUnsubscribeToken");
    expect(source).not.toContain("cronSecret");
  });

  it.each([
    "lib/api/unsubscribe-route.ts",
    "app/[locale]/(public)/unsubscribe/page.tsx",
  ])("%s verifies through the multi-key helper, not a bare secret", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");

    expect(source).toContain("verifyUnsubscribeTokenWithAny");
    expect(source).toContain("unsubscribeTokenSecret");
  });

  it.each([
    "lib/api/unsubscribe-route.ts",
    "app/[locale]/(public)/unsubscribe/page.tsx",
  ])("%s no longer verifies against the retired cron secret", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");

    // Replaces the sunset timer that used to live at the bottom of this file.
    // The timer could only fire once; this keeps the fallback from returning,
    // which is the property that actually needed guarding.
    expect(source).not.toContain("cronSecret");
  });
});
