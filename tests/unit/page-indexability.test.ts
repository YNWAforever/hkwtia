import {describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `translated:${key}`,
  setRequestLocale: vi.fn(),
}));

import {generateMetadata as unsubscribeMetadata} from "@/app/[locale]/(public)/unsubscribe/page";
import {generateMetadata as joinMetadata} from "@/app/[locale]/(join)/join/page";
import {generateMetadata as joinProfileMetadata} from "@/app/[locale]/(join)/join/profile/page";
import {generateMetadata as joinCompanyMetadata} from "@/app/[locale]/(join)/join/company/page";
import {generateMetadata as joinCheckoutMetadata} from "@/app/[locale]/(join)/join/checkout/page";
import {generateMetadata as joinCompleteMetadata} from "@/app/[locale]/(join)/join/complete/page";

const params = Promise.resolve({locale: "en"});

describe("page indexability", () => {
  // The unsubscribe URL carries a signed token identifying a member, and the
  // join steps are mid-flow and member-specific.
  it.each([
    ["unsubscribe", unsubscribeMetadata],
    ["join/profile", joinProfileMetadata],
    ["join/company", joinCompanyMetadata],
    ["join/checkout", joinCheckoutMetadata],
    ["join/complete", joinCompleteMetadata],
  ])("keeps %s out of search results", async (_name, build) => {
    const metadata = await build({params, searchParams: Promise.resolve({})} as never);
    expect(metadata.robots).toEqual({index: false, follow: false});
  });

  it("lets the join entry page be indexed with full metadata", async () => {
    const metadata = await joinMetadata({params, searchParams: Promise.resolve({})} as never);

    expect(metadata.robots).toBeUndefined();
    expect(metadata.title).toBe("translated:metaTitle");
    expect(metadata.description).toBe("translated:metaDescription");
    expect(metadata.alternates?.canonical).toContain("/join");
    expect(metadata.openGraph).toBeDefined();
  });
});
