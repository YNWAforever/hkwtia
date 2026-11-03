import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";

import {describe, expect, it, vi} from "vitest";

import {WTIA_WORDMARK_DATA_URL} from "@/lib/og/wordmark";

vi.mock("next/og", () => ({
  ImageResponse: class extends Response {
    constructor(element: unknown) { super(JSON.stringify(element)); }
  },
}));

import {GET} from "@/app/api/og/route";

describe("WTIA wordmark data URL", () => {
  it("decodes to the same bytes as the mono-white SVG", () => {
    const file = readFileSync("public/images/wtia-logo-mono-white.svg");
    const prefix = "data:image/svg+xml;base64,";
    expect(WTIA_WORDMARK_DATA_URL.startsWith(prefix)).toBe(true);
    const decoded = Buffer.from(WTIA_WORDMARK_DATA_URL.slice(prefix.length), "base64");
    expect(createHash("sha256").update(decoded).digest("hex")).toBe(createHash("sha256").update(file).digest("hex"));
    expect(createHash("sha256").update(file).digest("hex")).toBe("ebe911f1b290381a571ea9298f163a4fbb72d9ccd11789d03c1589caf3150e90");
  });
});

describe("GET /api/og image source", () => {
  const card = (image: string) => new Request("https://hkwtia.test/api/og?" + new URLSearchParams({kind: "member", title: "A member", eyebrow: "Member", image}));

  it("does not let a caller make ImageResponse fetch a loopback image", async () => {
    const tree = await (await GET(card("http://127.0.0.1:1234/probe"))).text();
    expect(tree).toContain("A member");
    expect(tree).not.toContain("127.0.0.1");
  });

  it("does not paint a member photograph or logo onto the navy card", async () => {
    const tree = await (await GET(card("/images/member.png"))).text();
    expect(tree).toContain("A member");
    expect(tree).not.toContain("https://hkwtia.test/images/member.png");
    expect(tree).toContain("data:image/svg+xml;base64,");
    expect(tree).not.toContain("https://hkwtia.test/images/wtia-logo-mono-white.png");
    expect(tree).not.toContain("https://hkwtia.test/images/wtia-logo-mono-white.svg");
    expect(tree).toContain("#0F4C81");
    expect(tree).not.toContain("#1b4f7a");
    expect(tree).not.toContain("#e8cf9a");
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
    const tree = JSON.stringify(element);

    expect(tree).toContain("A distinctive headline");
    expect(tree).toContain("Hong Kong Wireless Technology Industry Association");
    expect(tree).toContain("#0F4C81");
    expect(tree).toContain("#6686BD");
    expect(tree).not.toContain("#1b4f7a");
    expect(tree).not.toContain("#e8cf9a");
    expect(tree).not.toMatch(/WiseTech|WISE/);
  });

  it("falls back to the WTIA brand when the query is incomplete", async () => {
    const tree = await (await GET(new Request("https://hkwtia.test/api/og"))).text();

    expect(tree).toContain("Hong Kong Wireless Technology Industry Association");
    expect(tree).toContain("香港無線科技商會");
    expect(tree).not.toMatch(/WiseTech/i);
  });

  it("keeps photographs and member marks off every card", () => {
    const logo = JSON.stringify(renderOgCard("logo", {title: "Acme", eyebrow: "Member", imageUrl: "https://cdn.example/logo.svg"}));
    const photo = JSON.stringify(renderOgCard("photo", {title: "Acme", eyebrow: "Event", imageUrl: "https://cdn.example/hero.jpg"}));

    expect(photo).not.toContain("linear-gradient");
    expect(photo).not.toContain("cdn.example");
    expect(logo).not.toContain("cdn.example");
    expect(photo).toContain("#0F4C81");
    expect(logo).toContain("data:image/svg+xml;base64,");
    expect(logo).not.toContain("/images/wtia-logo-mono-white.png");
    expect(logo).not.toContain("/images/wtia-logo-mono-white.svg");
  });
});
