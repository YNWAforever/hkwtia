import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";

import {DirectoryResults} from "@/components/portal/directory-results";
import {labelSeparator, labelledValue} from "@/lib/i18n/punctuation";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("label separators", () => {
  it("gives English a trailing space and Chinese none, because ：carries its own", () => {
    expect(labelSeparator("en")).toBe(": ");
    expect(labelSeparator("zh-HK")).toBe("：");
    expect(labelledValue("en", "Company", "Acme")).toBe("Company: Acme");
    expect(labelledValue("zh-HK", "公司", "Acme")).toBe("公司：Acme");
  });

  // /portal/directory is auth-gated and force-dynamic, so it is absent from the
  // built HTML that the other locale checks grep. This is its coverage.
  it.each([
    {locale: "en" as const, bundle: en.Portal.directory},
    {locale: "zh-HK" as const, bundle: zh.Portal.directory},
  ])("renders the directory record separators for $locale", ({locale, bundle}) => {
    const html = renderToStaticMarkup(<DirectoryResults
      locale={locale}
      query=""
      labels={{search: bundle.search, empty: bundle.empty, next: bundle.next, previous: bundle.previous, company: bundle.company, industry: bundle.industry, sizeBand: bundle.sizeBand}}
      page={{nextCursor: null, items: [{userId: "u-1", companyId: "c-1", displayName: "Member One", jobTitle: "CTO", companyDisplayName: "Acme", industry: "Fintech", sizeBand: "11-50"}]}}/>);

    // The label is bold and the value is not, so the separator closes the span.
    // `公司: </span>Acme` is what shipped before lib/i18n/punctuation existed.
    expect(html).toContain(`${bundle.company}${labelSeparator(locale)}</span>Acme`);
    expect(html).toContain(`${bundle.industry}${labelSeparator(locale)}</span>Fintech`);
    if (locale === "zh-HK") expect(html).not.toMatch(/\p{Script=Han}\s*:/u);
  });
});
