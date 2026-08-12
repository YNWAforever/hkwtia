import {describe, expect, it} from "vitest";

import {
  FEATURED_WORD_THRESHOLD,
  parseMilestoneHtml,
  slugFromLegacyPath,
} from "@/scripts/extract-milestones";

const html = `<html><head><title>2003 - The 1st WTIA Awards | WTIA - Hong Kong Wireless Technology Industry Association</title></head>
<body><article>
<p>The first WTIA Awards recognised J2ME Open entries.</p>
<img src="https://hkwtia.org/wp-content/uploads/awards.jpg" alt="Award ceremony" />
<p>&nbsp;</p>
<p>It drew entries from across the region.</p>
</article></body></html>`;

describe("milestone extraction", () => {
  it("derives slug, year and month from the legacy path", () => {
    expect(slugFromLegacyPath("/2003/01/2003-the-1st-wtia-awards/"))
      .toEqual({slug: "2003-the-1st-wtia-awards", year: 2003, month: "01"});
  });

  it("strips the site suffix from the title", () => {
    expect(parseMilestoneHtml(html, "/2003/01/x/").titleEn)
      .toBe("2003 - The 1st WTIA Awards");
  });

  it("joins paragraphs and drops whitespace-only ones", () => {
    const {bodyEn} = parseMilestoneHtml(html, "/2003/01/x/");
    expect(bodyEn).toBe(
      "The first WTIA Awards recognised J2ME Open entries.\n\nIt drew entries from across the region.",
    );
  });

  // Images are rewritten to the own-origin path Task 6 will populate. Leaving
  // the hkwtia.org URL would produce content that renders nothing under the CSP
  // and breaks entirely when the site is switched off.
  it("rewrites image sources to the local history directory", () => {
    expect(parseMilestoneHtml(html, "/2003/01/x/").images).toEqual([
      {src: "/images/history/awards.jpg", altEn: "Award ceremony", altZh: ""},
    ]);
  });

  // Real captures include lazy-loaded images: src is a blank-SVG data: URI
  // placeholder and the real file lives in data-orig-src. Two of the 61 real
  // milestone pages do this; without a fallback those images are silently
  // dropped from the draft instead of migrated.
  it("resolves lazy-loaded images from data-orig-src", () => {
    const lazy = html.replace(
      '<img src="https://hkwtia.org/wp-content/uploads/awards.jpg" alt="Award ceremony" />',
      '<img src="data:image/svg+xml,%3Csvg%2F%3E" class="lazyload" data-orig-src="https://hkwtia.org/wp-content/uploads/awards.jpg" alt="Award ceremony" />',
    );
    expect(parseMilestoneHtml(lazy, "/2003/01/x/").images).toEqual([
      {src: "/images/history/awards.jpg", altEn: "Award ceremony", altZh: ""},
    ]);
  });

  // The theme renders a "Related Posts" carousel *inside* <article>, showing
  // the site's other posts by recency rather than anything about this one.
  // Verified on the real archive: a 2020 postponement notice's "related
  // posts" were three unconnected 2025 announcements. 45 of the 61 real
  // milestone pages have this block; left in, it pads every one of those
  // posts' images (and downstream, Task 6's downloads) with unrelated photos.
  it("excludes the related-posts carousel from body and images", () => {
    const withRelated = html.replace(
      "</article>",
      '<section class="related-posts single-related-posts"><p>Some other post title</p>'
        + '<img src="https://hkwtia.org/wp-content/uploads/other.jpg" alt="Unrelated" /></section></article>',
    );
    const result = parseMilestoneHtml(withRelated, "/2003/01/x/");
    expect(result.bodyEn).toBe(
      "The first WTIA Awards recognised J2ME Open entries.\n\nIt drew entries from across the region.",
    );
    expect(result.images).toEqual([
      {src: "/images/history/awards.jpg", altEn: "Award ceremony", altZh: ""},
    ]);
  });

  // WordPress/Yoast render typographic punctuation as numeric character
  // references rather than named entities. Verified on the real archive:
  // &#8220;/&#8221; (curly quotes) and &#8211; (en dash) alone occur 34 times
  // across the 61 real posts; left undecoded they show up as literal
  // "&#8221;" text on the page instead of the punctuation they represent.
  it("decodes numeric HTML entities, including zero-padded and hex forms", () => {
    const entities = html.replace(
      "It drew entries from across the region.",
      "It drew &#8220;huge&#8221; entries &#8211; from across the region &#x2014; and beyond&#039;s edge.",
    );
    expect(parseMilestoneHtml(entities, "/2003/01/x/").bodyEn).toBe(
      "The first WTIA Awards recognised J2ME Open entries."
        + "\n\nIt drew “huge” entries – from across the region — and beyond's edge.",
    );
  });

  it("marks an entry featured only above the word threshold", () => {
    const long = html.replace(
      "It drew entries from across the region.",
      "word ".repeat(FEATURED_WORD_THRESHOLD),
    );
    expect(parseMilestoneHtml(html, "/2003/01/x/").featured).toBe(false);
    expect(parseMilestoneHtml(long, "/2003/01/x/").featured).toBe(true);
  });
});
