import type {Organization, WithContext} from "schema-dts";
import {describe, expect, it} from "vitest";

import {siteConfig} from "@/config/site";
import {buildOrganizationData, buildWebSiteData} from "@/lib/structured-data";

describe("buildOrganizationData", () => {
  it("reads email, phone and address from siteConfig.contact, never the message bundle (E-68)", () => {
    // schema-dts's `Organization` is a union that includes a plain `string` (an IdReference),
    // so indexing straight off `WithContext<Organization>` fails to typecheck even though
    // buildOrganizationData() only ever returns the object shape. Narrowed here, not in the
    // production return type, so callers still get the honest, broader schema-dts type.
    const data = buildOrganizationData() as WithContext<Exclude<Organization, string>>;

    expect(data.alternateName).toEqual(["WiseTech Hong Kong", "HKWTA", "WTIA"]);
    expect(data.email).toBe(siteConfig.contact.email);
    expect(data.telephone).toBe(siteConfig.contact.phone);
    expect(data.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: siteConfig.contact.addressLines.slice(0, -1).join(", "),
      addressLocality: siteConfig.contact.addressLines.at(-1),
      addressCountry: "HK",
    });
  });
});

describe("buildWebSiteData", () => {
  it("declares both site languages", () => {
    const data = buildWebSiteData();

    expect(data["@type"]).toBe("WebSite");
    expect(data.inLanguage).toEqual(["en-HK", "zh-Hant-HK"]);
  });
});
