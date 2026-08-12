import {describe, expect, it} from "vitest";

import {milestoneSchema} from "@/content/schemas";

const valid = {
  slug: "2001-establishment-of-wtia",
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

  it("rejects a month outside 01-12", () => {
    for (const month of ["00", "13", "1", "aa"]) {
      expect(() => milestoneSchema.parse({...valid, month}), month).toThrow();
    }
  });
});
