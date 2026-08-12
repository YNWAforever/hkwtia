import {describe, expect, it} from "vitest";

import {
  downloadImages,
  extractImageUrls,
  extractReferencedImagePaths,
  fetchImageBytes,
  localFilename,
} from "@/scripts/download-milestone-images";

describe("recovering remote image urls", () => {
  const html = `<html><body><article>
<p>The postponement notice text.</p>
<img src="https://hkwtia.org/wp-content/uploads/2020/03/real.jpg" alt="Real" />
<section class="related-posts single-related-posts">
  <p>Some other post title</p>
  <img src="https://hkwtia.org/wp-content/uploads/2025/01/unrelated.jpg" alt="Unrelated" />
</section>
</article></body></html>`;

  // This is the bug that made an earlier count of this same archive wrong by
  // a factor of two and a half: the theme renders "Related Posts" *inside*
  // <article>, showing unconnected recent posts rather than anything about
  // this one. Left in, every one of the 45 (of 61) real pages that have this
  // block would have their downloads padded with unrelated photos.
  it("drops a related-posts image and keeps the real one", () => {
    expect(extractImageUrls(html)).toEqual([
      "https://hkwtia.org/wp-content/uploads/2020/03/real.jpg",
    ]);
  });

  // Two of the 61 real milestone pages lazy-load their hero image: src is a
  // blank-SVG data: placeholder and the real url is in data-orig-src.
  // Without this fallback the only image on the page is silently dropped.
  it("resolves a lazy-loaded image from data-orig-src", () => {
    const lazy = html.replace(
      '<img src="https://hkwtia.org/wp-content/uploads/2020/03/real.jpg" alt="Real" />',
      '<img src="data:image/svg+xml,%3Csvg%2F%3E" class="lazyload" '
        + 'data-orig-src="https://hkwtia.org/wp-content/uploads/2020/03/real.jpg" alt="Real" />',
    );
    expect(extractImageUrls(lazy)).toEqual([
      "https://hkwtia.org/wp-content/uploads/2020/03/real.jpg",
    ]);
  });
});

describe("mapping a remote url to its local filename", () => {
  // 11 of the 73 real originals contain an en-dash or Chinese characters,
  // which milestoneSchema's src pattern can never match, so a human picked
  // an ASCII-safe name for each during review and recorded it here.
  const renameMap = {
    "20200409_IT界要求援助記招.jpg": "20200409-it-sme-relief-press-conference.jpg",
  };

  it("honours the rename map for a renamed original", () => {
    expect(localFilename(
      "https://hkwtia.org/wp-content/uploads/2020/04/20200409_IT界要求援助記招.jpg",
      renameMap,
    )).toBe("20200409-it-sme-relief-press-conference.jpg");
  });

  it("keeps the original basename when it is not in the map", () => {
    expect(localFilename(
      "https://hkwtia.org/wp-content/uploads/2003/01/wlan-wardriving-1024x620-1.jpg",
      renameMap,
    )).toBe("wlan-wardriving-1024x620-1.jpg");
  });
});

describe("fetching image bytes with retry", () => {
  // hkwtia.org returns intermittent Cloudflare 520s -- the same reason
  // scripts/capture-legacy-site.ts has a retry helper. A single failure must
  // not lose an irreplaceable file.
  it("retries a transient failure and eventually succeeds", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls < 3) return {ok: false, status: 520, arrayBuffer: async () => new ArrayBuffer(0)};
      return {ok: true, status: 200, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer};
    };

    const bytes = await fetchImageBytes("https://hkwtia.org/x.jpg", fetchImpl, {attempts: 3, delayMs: 0});

    expect(calls).toBe(3);
    expect(bytes).toEqual(Buffer.from([1, 2, 3]));
  });

  it("returns null rather than throwing when every attempt fails", async () => {
    const fetchImpl = async () => ({ok: false, status: 520, arrayBuffer: async () => new ArrayBuffer(0)});

    const bytes = await fetchImageBytes("https://hkwtia.org/x.jpg", fetchImpl, {attempts: 2, delayMs: 0});

    expect(bytes).toBeNull();
  });
});

describe("downloading the recovered urls", () => {
  it("saves every successfully fetched image and reports it", async () => {
    const written: Array<{url: string; bytes: Buffer}> = [];
    const fetchBinary = async (url: string) => Buffer.from(url);

    const {saved, missed} = await downloadImages(
      ["https://hkwtia.org/a.jpg", "https://hkwtia.org/b.jpg"],
      fetchBinary,
      async (url, bytes) => {
        written.push({url, bytes});
      },
    );

    expect(saved).toEqual(["https://hkwtia.org/a.jpg", "https://hkwtia.org/b.jpg"]);
    expect(missed).toEqual([]);
    expect(written).toHaveLength(2);
  });

  // These files exist nowhere but the site being retired. A permanently
  // failing url (retries exhausted) must land in `missed` for the caller to
  // report, not throw and abort the other 72 successful downloads.
  it("puts a permanently failing url in missed rather than throwing", async () => {
    const fetchBinary = async (url: string) => (url.includes("fail") ? null : Buffer.from("ok"));

    const {saved, missed} = await downloadImages(
      ["https://hkwtia.org/ok.jpg", "https://hkwtia.org/fail.jpg"],
      fetchBinary,
      async () => {},
    );

    expect(saved).toEqual(["https://hkwtia.org/ok.jpg"]);
    expect(missed).toEqual(["https://hkwtia.org/fail.jpg"]);
  });
});

describe("extracting referenced image paths from the content file text", () => {
  // content/milestones.ts fails Zod validation right now -- titleZh, bodyZh
  // and most alt text are still empty pending Task 7 -- so importing it
  // would throw before verification could run. Reading it as text sidesteps
  // that entirely.
  it("pulls every images[].src value out of the source text", () => {
    const source = `
      images: [
        {src: '/images/history/a.jpg', altEn: '', altZh: ''},
        {src: '/images/history/b.png', altEn: '', altZh: ''}
      ],
    `;
    expect(extractReferencedImagePaths(source)).toEqual([
      "/images/history/a.jpg",
      "/images/history/b.png",
    ]);
  });

  it("returns an empty array when there are no image references", () => {
    expect(extractReferencedImagePaths("images: [],")).toEqual([]);
  });
});
