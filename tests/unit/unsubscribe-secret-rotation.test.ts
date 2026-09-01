import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {
  LEGACY_UNSUBSCRIBE_SECRET_SUNSET,
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
  it("signs with the dedicated secret and never with the cron bearer", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/jobs/runners.ts"), "utf8");

    // Matched on the property name rather than a particular accessor
    // expression, so narrowing `serverEnv()` to a feature-scoped contract
    // stays a refactor instead of silently retiring this guard.
    expect(source).toMatch(/\bunsubscribeTokenSecret\b/);
    // If signing were merely aliased, a leaked bearer would still mint tokens.
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
});

describe("the legacy fallback deletes itself on schedule", () => {
  // Deliberately self-detonating. The last token signed with CRON_SECRET stays
  // valid for the 30-day UNSUBSCRIBE_TTL_SECONDS after the deploy, so the
  // fallback cannot be removed before then — and should not linger after.
  it(`fails once ${LEGACY_UNSUBSCRIBE_SECRET_SUNSET} has passed`, () => {
    const sunset = Date.parse(`${LEGACY_UNSUBSCRIBE_SECRET_SUNSET}T00:00:00Z`);

    expect(Number.isNaN(sunset)).toBe(false);
    expect(
      Date.now() < sunset,
      `The CRON_SECRET fallback for unsubscribe links was due for removal on `
      + `${LEGACY_UNSUBSCRIBE_SECRET_SUNSET}. Every link signed with the old key has now `
      + `expired. Drop unsubscribeEnv().cronSecret from the secrets arrays in `
      + `lib/api/unsubscribe-route.ts and app/[locale]/(public)/unsubscribe/page.tsx, `
      + `then delete LEGACY_UNSUBSCRIBE_SECRET_SUNSET and this test.`,
    ).toBe(true);
  });
});
