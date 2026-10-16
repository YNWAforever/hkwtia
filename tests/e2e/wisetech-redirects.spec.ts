import {expect, test} from "@playwright/test";

// [source, destination, expected status of the destination]. The redirect is what is under
// test, so the landing status only needs to prove the rule fired and the proxy did not rewrite
// the prefixed forms to a `zh-HK` page that does not exist — the pathname assertion is the real
// subject. Two merge destinations legitimately 404 for an anonymous visitor, which is not this
// rule's concern: `/join/complete` calls `notFound()` without a live `membership_id`
// (app/[locale]/(join)/join/complete/page.tsx), and `/showcase/anything` is not a reviewed
// listing (app/[locale]/(public)/showcase/[slug]/page.tsx).
//
// Phase B2 (D-11) made `/members` and `/members/[slug]` real reviewed member pages and deleted
// the two temporary `/members` 307s to `/showcase`, so `/zh/members/anything` is no longer a
// redirect at all. The prefixed dynamic-merge coverage it provided moved to the surviving
// `route-design-solution-detail` row (`/solutions/[slug]` -> `/showcase/[slug]`), which is the
// one generated rule that has to carry a path parameter through the `/zh` prefix.
const cases: readonly [string, string, number][] = [
  ["/why-wisetech", "/about", 200],
  ["/en/why-wisetech", "/about", 200],
  ["/zh/why-wisetech", "/zh/about", 200],
  ["/programmes/launchpad", "/launchpad", 200],
  ["/zh/join/success", "/zh/join/complete", 404],
  ["/request-introduction", "/showcase", 200],
  ["/zh/solutions/anything", "/zh/showcase/anything", 404],
];

// WP-7: every manifest "merge" route is a real redirect for the bare, /en and /zh forms.
test.describe("WiseTech design redirects", () => {
  for (const [source, destination, status] of cases) {
    test(`${source} resolves to ${destination}`, async ({page}) => {
      const response = await page.goto(source, {waitUntil: "commit"});
      expect(response?.status()).toBe(status);
      expect(new URL(page.url()).pathname).toBe(destination);
    });
  }
});
