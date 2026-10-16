import {describe, expect, it} from "vitest";

import {qrSvg} from "@/lib/tickets/qr";

describe("qrSvg", () => {
  it("returns an SVG document, not an image path or a data url", async () => {
    const svg = await qrSvg("https://hkwtia.org/en/admin/check-in/abc.def");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("data:image");
  });

  it("encodes different payloads differently, so the QR is not a placeholder", async () => {
    const first = await qrSvg("https://example.test/a");
    const second = await qrSvg("https://example.test/b");
    expect(first).not.toEqual(second);
  });

  it("emits no script, because the pass page inlines it", async () => {
    expect(await qrSvg("https://example.test/a")).not.toMatch(/<script/i);
  });
});
