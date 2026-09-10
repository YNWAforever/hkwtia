import type {Organization, WithContext} from "schema-dts";
import {describe, expect, it} from "vitest";

import {siteConfig} from "@/config/site";
import {
  buildBreadcrumbData,
  buildEventData,
  buildMemberOrganizationData,
  buildOrganizationData,
  buildWebSiteData,
} from "@/lib/structured-data";
import {absoluteUrl} from "@/lib/urls";

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

describe("buildEventData", () => {
  const base = {slug: "x", startsAt: "2030-03-01T02:00:00.000Z", endsAt: null, venue: null} as const;

  it("emits the organiser company as Event.organizer, with its URL only when it has a public page (B-6)", () => {
    expect(buildEventData({...base, organiser: {name: "Acme Ltd", url: "https://hkwtia.example/members/acme"}}, "X", "en")).toMatchObject({
      organizer: {"@type": "Organization", name: "Acme Ltd", url: "https://hkwtia.example/members/acme"},
    });
    const unlinked = buildEventData({...base, organiser: {name: "Acme Ltd", url: null}}, "X", "en");
    expect(unlinked.organizer).toEqual({"@type": "Organization", name: "Acme Ltd"});
  });

  it("keeps WTIA as the organizer for an admin-authored event", () => {
    for (const record of [base, {...base, organiser: null}]) {
      expect(buildEventData(record, "X", "en").organizer).toEqual({"@type": "Organization", name: siteConfig.name, url: expect.stringMatching(/\/$/)});
    }
  });

  it("maps the event format to eventAttendanceMode and omits it when the record carries none", () => {
    expect(buildEventData({...base, format: "online"}, "X", "en").eventAttendanceMode).toBe("https://schema.org/OnlineEventAttendanceMode");
    expect(buildEventData({...base, format: "in_person"}, "X", "en").eventAttendanceMode).toBe("https://schema.org/OfflineEventAttendanceMode");
    expect(buildEventData({...base, format: "hybrid"}, "X", "en").eventAttendanceMode).toBe("https://schema.org/MixedEventAttendanceMode");
    expect(buildEventData(base, "X", "en")).not.toHaveProperty("eventAttendanceMode");
  });
});

describe("buildMemberOrganizationData (D-11)", () => {
  const profile = {
    name: "Harbour Vision AI",
    slug: "harbour-vision-ai",
    website: "https://harbourvision.example/",
    logoUrl: "/images/logo.png",
    description: "Trade intelligence for Hong Kong logistics.",
  } as const;

  it("names the member page as the organisation url and WTIA as memberOf", () => {
    const data = buildMemberOrganizationData(profile, "en") as WithContext<Exclude<Organization, string>>;

    expect(data["@type"]).toBe("Organization");
    expect(data.name).toBe("Harbour Vision AI");
    expect(data.url).toBe(absoluteUrl("/members/harbour-vision-ai"));
    expect(data.sameAs).toEqual(["https://harbourvision.example/"]);
    expect(data.logo).toBe(absoluteUrl("/images/logo.png"));
    expect(data.description).toBe(profile.description);
    expect(data.memberOf).toEqual({"@type": "Organization", name: siteConfig.name, url: absoluteUrl("/")});
  });

  it("uses the /zh member url in Chinese and omits every field the profile does not carry", () => {
    const data = buildMemberOrganizationData(
      {name: "Harbour Vision AI", slug: "harbour-vision-ai", website: null, logoUrl: null, description: null},
      "zh-HK",
    ) as WithContext<Exclude<Organization, string>>;

    expect(data.url).toBe(absoluteUrl("/zh/members/harbour-vision-ai"));
    expect(data).not.toHaveProperty("sameAs");
    expect(data).not.toHaveProperty("logo");
    expect(data).not.toHaveProperty("description");
  });
});

describe("buildBreadcrumbData (D-11)", () => {
  it("positions every item from one, in the order it was given", () => {
    const data = buildBreadcrumbData([
      {name: "Home", url: "https://example.test/"},
      {name: "Members", url: "https://example.test/members"},
      {name: "Harbour Vision AI", url: "https://example.test/members/harbour-vision-ai"},
    ]);

    expect(data["@type"]).toBe("BreadcrumbList");
    expect(data.itemListElement).toEqual([
      {"@type": "ListItem", position: 1, name: "Home", item: "https://example.test/"},
      {"@type": "ListItem", position: 2, name: "Members", item: "https://example.test/members"},
      {"@type": "ListItem", position: 3, name: "Harbour Vision AI", item: "https://example.test/members/harbour-vision-ai"},
    ]);
  });
});
