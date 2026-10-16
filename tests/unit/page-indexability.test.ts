import {describe, expect, it, vi} from "vitest";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `translated:${key}`,
  setRequestLocale: vi.fn(),
}));
// Portal and Admin layouts import `@/lib/auth/actor` at module scope. Under vitest, the
// `authEnv()` call inside `lib/auth/server` is not itself fatal here -- this same file imports
// member-login/page.tsx -> actions.ts -> lib/auth/server unmocked below. What this mock actually
// needs to cut is `@/lib/auth/actor` -> `lib/db/repos/profile-identities` -> `lib/db/client`,
// which constructs a `Pool` at module scope, even though the layouts' static `metadata` export
// never calls it.
vi.mock("@/lib/auth/actor", () => ({requireActor: vi.fn(), getActor: vi.fn()}));
vi.mock("@/lib/admin/page-auth", () => ({requireAdminPageActor: vi.fn()}));

import {generateMetadata as unsubscribeMetadata} from "@/app/[locale]/(public)/unsubscribe/page";
import {generateMetadata as joinMetadata} from "@/app/[locale]/(join)/join/page";
import {generateMetadata as joinProfileMetadata} from "@/app/[locale]/(join)/join/profile/page";
import {generateMetadata as joinCompanyMetadata} from "@/app/[locale]/(join)/join/company/page";
import {generateMetadata as joinCheckoutMetadata} from "@/app/[locale]/(join)/join/checkout/page";
import {generateMetadata as joinCompleteMetadata} from "@/app/[locale]/(join)/join/complete/page";
import {metadata as portalMetadata} from "@/app/[locale]/(member)/portal/layout";
import {metadata as adminMetadata} from "@/app/[locale]/(admin)/admin/layout";
import {metadata as memberLoginMetadata} from "@/app/[locale]/member-login/page";

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

  // Portal and Admin are authenticated surfaces; member-login is the auth hand-off. All three
  // carry a static `metadata` export (not `generateMetadata`) rather than a per-page block --
  // Portal and Admin's metadata merges into every page below it in the layout.
  it.each([
    ["portal layout", portalMetadata],
    ["admin layout", adminMetadata],
    ["member-login", memberLoginMetadata],
  ])("keeps the %s out of search results", (_name, value) => {
    expect(value.robots).toEqual({index: false, follow: false});
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
