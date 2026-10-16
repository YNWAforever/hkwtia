import {describe, expect, it} from "vitest";

import {ogImagePath} from "@/lib/og/resolve-renderer";

describe("ogImagePath", () => {
  it("builds a card url carrying everything the renderer needs", () => {
    const path = ogImagePath({kind: "news", title: "WTIA signs GBA memorandum", eyebrow: "News", imageUrl: null});

    expect(path.startsWith("/api/og?")).toBe(true);
    const params = new URLSearchParams(path.slice(path.indexOf("?") + 1));
    expect(params.get("kind")).toBe("news");
    expect(params.get("title")).toBe("WTIA signs GBA memorandum");
    expect(params.get("eyebrow")).toBe("News");
    expect(params.has("image")).toBe(false);
  });

  it("carries the image only when there is one", () => {
    const path = ogImagePath({kind: "event", title: "t", eyebrow: "Event", imageUrl: "https://cdn.example/h.jpg"});

    expect(new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("image")).toBe("https://cdn.example/h.jpg");
  });

  it("encodes a title containing an ampersand rather than truncating the query", () => {
    const path = ogImagePath({kind: "news", title: "Tech & Wisdom", eyebrow: "News", imageUrl: null});

    expect(new URLSearchParams(path.slice(path.indexOf("?") + 1)).get("title")).toBe("Tech & Wisdom");
  });
});
