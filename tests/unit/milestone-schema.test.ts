import {describe, expect, it} from "vitest";

import {milestoneSchema} from "@/content/schemas";

const valid = {
  slug: "2001-establishment-of-wtia",
  kind: "milestone",
  year: 2001,
  month: "01",
  titleEn: "Establishment of WTIA",
  titleZh: "香港無線科技商會成立",
  bodyEn: "The association was founded in 2001.",
  bodyZh: "商會於二零零一年成立。",
  images: [{src: "/images/history/2001-inauguration.jpg", altEn: "Inauguration", altZh: "就職典禮"}],
  legacyPath: "/2001/01/2001-establishment-of-wtia/",
  featured: false,
};

describe("milestone schema", () => {
  it("accepts a complete entry", () => {
    expect(milestoneSchema.parse(valid).slug).toBe("2001-establishment-of-wtia");
  });

  // Both locales are required rather than optional. A milestone with an empty
  // Chinese body would render a blank page on /zh rather than failing the build.
  it.each(["titleEn", "titleZh", "bodyEn", "bodyZh"])("requires %s", (field) => {
    expect(() => milestoneSchema.parse({...valid, [field]: ""})).toThrow();
  });

  // The CSP is `img-src 'self' data:` and next.config.ts declares no remote
  // hosts, so a remote image would silently fail to render in the browser.
  it("rejects an image that is not own-origin under /images/history/", () => {
    for (const src of ["https://hkwtia.org/a.jpg", "/images/a.jpg", "images/history/a.jpg"]) {
      expect(() => milestoneSchema.parse({
        ...valid, images: [{src, altEn: "a", altZh: "a"}],
      }), src).toThrow();
    }
  });

  it("rejects a legacy path that is not a WordPress dated post", () => {
    for (const legacyPath of ["/about", "/2001/establishment/", "2001/01/x/"]) {
      expect(() => milestoneSchema.parse({...valid, legacyPath}), legacyPath).toThrow();
    }
  });

  // WordPress falls back to a percent-encoded slug when a post's title is
  // Chinese and no manual slug was set -- true for 12 of the 61 real posts,
  // confirmed against content/legacy-urls.json which stores the identical
  // encoded form as the redirect source Task 10 matches against verbatim.
  // Rejecting it here would make those 12 entries impossible to ever satisfy
  // the schema, since legacyPath must stay the true original path.
  it("accepts a legacy path with a percent-encoded slug", () => {
    const legacyPath = "/2016/08/wtia-meet-our-member-%e9%a6%ac%e7%94%b0%e9%9b%bb%e8%85%a6-cypher-martin/";
    expect(milestoneSchema.parse({...valid, legacyPath}).legacyPath).toBe(legacyPath);
  });

  it("rejects a month outside 01-12", () => {
    for (const month of ["00", "13", "1", "aa"]) {
      expect(() => milestoneSchema.parse({...valid, month}), month).toThrow();
    }
  });

  // The archive holds member interviews and republished vendor press releases
  // alongside WTIA's own record; an unrecognised or absent kind must not
  // silently fall into one of the three surfaces Task 10 routes them to.
  it("accepts each valid kind", () => {
    for (const kind of ["milestone", "member-story", "press-release"]) {
      expect(milestoneSchema.parse({...valid, kind}).kind).toBe(kind);
    }
  });

  it("rejects an unknown kind", () => {
    expect(() => milestoneSchema.parse({...valid, kind: "news"})).toThrow();
  });

  it("rejects a missing kind", () => {
    const withoutKind: Record<string, unknown> = {...valid};
    delete withoutKind.kind;
    expect(() => milestoneSchema.parse(withoutKind)).toThrow();
  });
});
