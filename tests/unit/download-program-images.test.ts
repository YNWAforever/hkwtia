import {describe, expect, it} from "vitest";

import {extractImageUrls, localFilename} from "@/scripts/download-program-images";

describe("programme image extraction", () => {
  // The theme renders a "Related Posts" carousel inside <article>. Counting it
  // is what made an earlier estimate of this same archive wrong by a factor of
  // two and a half, so this is pinned rather than assumed.
  it("excludes the related-posts carousel", () => {
    // `<section class="related-posts">` is the theme's own markup, and the
    // region selection splits on precisely that. Writing this fixture as a
    // <div> would make the test pass against a version of the code that had
    // stopped excluding anything.
    const html = `
      <article>
        <img src="https://hkwtia.org/wp-content/uploads/real.jpg">
        <section class="related-posts">
          <img src="https://hkwtia.org/wp-content/uploads/unrelated.jpg">
        </section>
      </article>`;
    expect(extractImageUrls(html)).toEqual(["https://hkwtia.org/wp-content/uploads/real.jpg"]);
  });

  // Lazy-loaded images hold a blank-SVG placeholder in src and the real url in
  // data-orig-src. Reading src would download 1x1 placeholders over the record.
  it("prefers data-orig-src over a placeholder src", () => {
    const html =
      `<article><img src="data:image/svg+xml,blank" data-orig-src="https://hkwtia.org/wp-content/uploads/lazy.jpg"></article>`;
    expect(extractImageUrls(html)).toEqual(["https://hkwtia.org/wp-content/uploads/lazy.jpg"]);
  });

  it("renames only what the map covers", () => {
    const map = {"a–b.png": "a-b.png"};
    expect(localFilename("https://hkwtia.org/x/a–b.png", map)).toBe("a-b.png");
    expect(localFilename("https://hkwtia.org/x/plain.png", map)).toBe("plain.png");
  });

  // Filenames arrive percent-encoded in the url and must be decoded before the
  // rename map is consulted, or an entry keyed on the real filename never
  // matches and the file lands under a name programImageSchema rejects.
  it("decodes a percent-encoded basename before consulting the map", () => {
    const map = {"下載.png": "download.png"};
    expect(localFilename("https://hkwtia.org/x/%E4%B8%8B%E8%BC%89.png", map)).toBe("download.png");
  });
});
