import {expect, test} from "@playwright/test";

// [source, destination, expected status of the destination]. The redirect is what is under
// test, so the landing status only needs to prove the rule fired and the proxy did not rewrite
// the prefixed forms to a `zh-HK` page that does not exist. `/join/complete` is the one merge
// destination that legitimately 404s for an anonymous visitor: it calls `notFound()` without a
// live `membership_id` (app/[locale]/(join)/join/complete/page.tsx), which is not this rule's
// concern.
const cases: readonly [string, string, number][] = [
  ["/why-wisetech", "/about", 200],
  ["/en/why-wisetech", "/about", 200],
  ["/zh/why-wisetech", "/zh/about", 200],
  ["/programmes/launchpad", "/launchpad", 200],
  ["/zh/join/success", "/zh/join/complete", 404],
  ["/request-introduction", "/showcase", 200],
  ["/zh/members/anything", "/zh/showcase", 200],
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
