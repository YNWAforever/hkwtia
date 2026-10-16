import {describe, expect, it} from "vitest";

import {buildArticleData} from "@/lib/structured-data";

describe("buildArticleData", () => {
  it("describes a news post with its canonical url, dates and publisher", () => {
    const data = buildArticleData({
      slug: "wtia-signs-gba-mou",
      title: "WTIA signs GBA memorandum",
      description: "A summary of the agreement.",
      publishedAt: new Date("2026-03-04T02:00:00Z"),
      updatedAt: new Date("2026-03-06T09:30:00Z"),
      author: "WTIA Secretariat",
    }, "en");

    expect(data["@type"]).toBe("Article");
    expect(data.headline).toBe("WTIA signs GBA memorandum");
    expect(data.datePublished).toBe("2026-03-04T02:00:00.000Z");
    expect(data.dateModified).toBe("2026-03-06T09:30:00.000Z");
    expect(data.mainEntityOfPage).toBe("http://localhost:3000/news/wtia-signs-gba-mou");
    expect(data.author).toEqual({"@type": "Person", name: "WTIA Secretariat"});
  });

  it("omits image entirely rather than inventing one", () => {
    const data = buildArticleData({
      slug: "s", title: "t", description: "d",
      publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: null, author: null,
    }, "en");

    // `posts` has no image column. A placeholder url in structured data is a claim to a
    // crawler that something exists when it does not.
    expect("image" in data).toBe(false);
  });

  it("falls back to the published date when a post was never edited", () => {
    const data = buildArticleData({
      slug: "s", title: "t", description: "d",
      publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: null, author: null,
    }, "en");

    expect(data.dateModified).toBe("2026-01-01T00:00:00.000Z");
  });

  it("points a Chinese article at its /zh url", () => {
    const data = buildArticleData({
      slug: "s", title: "t", description: "d",
      publishedAt: new Date("2026-01-01T00:00:00Z"), updatedAt: null, author: null,
    }, "zh-HK");

    expect(data.mainEntityOfPage).toBe("http://localhost:3000/zh/news/s");
  });
});
