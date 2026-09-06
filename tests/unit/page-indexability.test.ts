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

  // D-1: noindex does not exempt the tab title. The billing steps reuse the branded Join.metaTitle;
  // the two form steps brand their own step title at runtime.
  it.each([
    ["join/checkout", joinCheckoutMetadata, "translated:metaTitle"],
    ["join/complete", joinCompleteMetadata, "translated:metaTitle"],
    ["join/profile", joinProfileMetadata, "translated:profileTitle | WiseTech Hong Kong"],
    ["join/company", joinCompanyMetadata, "translated:companyTitle | WiseTech Hong Kong"],
  ])("gives %s a branded tab title", async (_name, build, title) => {
    const metadata = await build({params, searchParams: Promise.resolve({})} as never);
    expect(metadata.title).toBe(title);
  });

  it("brands the zh-HK join step titles with the fullwidth separator", async () => {
    const zhParams = Promise.resolve({locale: "zh-HK"});
    const metadata = await joinProfileMetadata({params: zhParams, searchParams: Promise.resolve({})} as never);
    expect(metadata.title).toBe("translated:profileTitle｜WiseTech Hong Kong");
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
