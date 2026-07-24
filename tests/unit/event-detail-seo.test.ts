import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import {buildPageMetadata} from "@/lib/metadata";
import {buildEventData} from "@/lib/structured-data";

describe("repository event detail SEO", () => {
  it("retains canonical hreflang, Open Graph, Twitter, and localized Event JSON-LD", () => {
    const metadata = buildPageMetadata({locale: "zh-HK", pathname: "/events/member-mixer", title: "會員交流會", description: "與社群交流。"});
    expect(metadata.alternates).toMatchObject({canonical: expect.stringContaining("/zh/events/member-mixer"), languages: {en: expect.stringContaining("/events/member-mixer"), "zh-HK": expect.stringContaining("/zh/events/member-mixer")}});
    expect(metadata.openGraph).toMatchObject({title: "會員交流會", description: "與社群交流。"});
    expect(metadata.twitter).toMatchObject({title: "會員交流會", description: "與社群交流。"});

    const data = buildEventData({slug: "member-mixer", startsAt: "2099-09-01T10:00:00.000Z", endsAt: null, venue: "WTIA"}, "會員交流會");
    expect(data).toMatchObject({"@type": "Event", name: "會員交流會", startDate: "2099-09-01T10:00:00.000Z", location: {name: "WTIA"}});
  });

  it("wires the dynamic detail page through the shared metadata and structured-data helpers", () => {
    const source = readFileSync("app/[locale]/(public)/events/[slug]/page.tsx", "utf8");
    expect(source).toContain("buildPageMetadata");
    expect(source).toContain("<StructuredData");
    expect(source).toContain("buildEventData");
  });
});
