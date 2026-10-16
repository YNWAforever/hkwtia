import {describe, expect, it} from "vitest";

import {resolveOgRenderer} from "@/lib/og/resolve-renderer";

describe("resolveOgRenderer", () => {
  it("gives an event with a hero image the photo treatment", () => {
    const resolved = resolveOgRenderer({
      kind: "event", title: "Hong Kong ICT Awards 2026", imageUrl: "https://cdn.example/hero.jpg", eyebrow: "Event",
    });

    expect(resolved.renderer).toBe("photo");
    expect(resolved.props.imageUrl).toBe("https://cdn.example/hero.jpg");
  });

  it("falls back to editorial for an event with no hero image", () => {
    // events.heroMediaId is nullable, so this is the ordinary case, not the exception.
    const resolved = resolveOgRenderer({kind: "event", title: "t", imageUrl: null, eyebrow: "Event"});

    expect(resolved.renderer).toBe("editorial");
  });

  it.each(["member", "showcase"] as const)("puts a %s logo on a light ground, never under a scrim", (kind) => {
    const resolved = resolveOgRenderer({kind, title: "Acme Wireless Ltd", imageUrl: "https://cdn.example/logo.svg", eyebrow: "Member"});

    // A logo cropped to 1200x630 and darkened mangles the member's mark. Their brand is
    // the thing the directory trades on.
    expect(resolved.renderer).toBe("logo");
  });

  it("falls back to editorial for a member with no logo", () => {
    const resolved = resolveOgRenderer({kind: "member", title: "t", imageUrl: null, eyebrow: "Member"});

    expect(resolved.renderer).toBe("editorial");
  });

  it.each(["news", "programme", "milestone", "page"] as const)("always renders %s editorially", (kind) => {
    // `posts` has no image column at all, so news can never supply one.
    const resolved = resolveOgRenderer({kind, title: "t", imageUrl: null, eyebrow: "News"});

    expect(resolved.renderer).toBe("editorial");
  });

  it("ignores an image supplied for a kind that has no image treatment", () => {
    const resolved = resolveOgRenderer({kind: "news", title: "t", imageUrl: "https://cdn.example/x.jpg", eyebrow: "News"});

    expect(resolved.renderer).toBe("editorial");
    expect("imageUrl" in resolved.props).toBe(false);
  });

  it("truncates a title too long to fit the card rather than overflowing it", () => {
    const resolved = resolveOgRenderer({kind: "news", title: "x".repeat(200), eyebrow: "News", imageUrl: null});

    expect(resolved.props.title.length).toBeLessThanOrEqual(120);
    expect(resolved.props.title.endsWith("…")).toBe(true);
  });
});
