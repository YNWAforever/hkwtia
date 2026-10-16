import {describe, expect, it, vi} from "vitest";

vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown) { super(JSON.stringify(element)); }
  },
}));

import {GET} from "@/app/api/og/route";

describe("GET /api/og image source", () => {
  const card = (image: string) => new Request("https://hkwtia.test/api/og?" + new URLSearchParams({kind: "member", title: "A member", eyebrow: "Member", image}));

  it("does not let a caller make ImageResponse fetch a loopback image", async () => {
    const tree = await (await GET(card("http://127.0.0.1:1234/probe"))).text();
    expect(tree).toContain("A member");
    expect(tree).not.toContain("127.0.0.1");
  });

  it("keeps a same-origin media image on the member card", async () => {
    const tree = await (await GET(card("/images/member.png"))).text();
    expect(tree).toContain("A member");
    expect(tree).toContain("https://hkwtia.test/images/member.png");
  });
});


import {renderOgCard} from "@/lib/og/renderers";

describe("renderOgCard", () => {
  it.each(["editorial", "logo", "photo"] as const)("returns a 1200x630 element tree for %s", (renderer) => {
    // Asserting on PNG bytes would be brittle theatre. What is worth pinning is that each
    // renderer produces an element at the size every social crawler expects.
    const element = renderOgCard(renderer, {
      title: "Hong Kong ICT Awards 2026",
      eyebrow: "Event",
      imageUrl: "https://cdn.example/x.jpg",
    });

    expect(element).toBeTruthy();
    expect(element.props.style.width).toBe(1200);
    expect(element.props.style.height).toBe(630);
  });

  it("renders the title into the tree so a missing headline is caught here, not by eye", () => {
    const element = renderOgCard("editorial", {title: "A distinctive headline", eyebrow: "News"});

    expect(JSON.stringify(element)).toContain("A distinctive headline");
  });

  it("never darkens a logo, unlike the photo treatment", () => {
    const logo = JSON.stringify(renderOgCard("logo", {title: "Acme", eyebrow: "Member", imageUrl: "u"}));
    const photo = JSON.stringify(renderOgCard("photo", {title: "Acme", eyebrow: "Event", imageUrl: "u"}));

    // The scrim is what would mangle a member's mark.
    expect(photo).toContain("linear-gradient");
    expect(logo).not.toContain("linear-gradient");
  });
});
