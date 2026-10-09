import {createHash} from "node:crypto";

import sharp from "sharp";
import {beforeAll, describe, expect, it, vi} from "vitest";

import {createMediaGet} from "@/lib/media/media-delivery-route";
import {MEDIA_DELIVERY_WIDTHS, mediaDeliverySrc} from "@/lib/media/url";

// Round 22: partner logos were delivered as 155KB, 960px PNGs into ~160px tiles. A width from a
// fixed list is resized inside the delivery route itself, after the same lookup, archive check and
// sha256 verification — never through Next's optimizer, which uploaded media must bypass.
const mediaId = "22222222-2222-4222-8222-222222222222";
let png: Buffer;

beforeAll(async () => {
  png = await sharp({create: {width: 1200, height: 600, channels: 4, background: {r: 20, g: 90, b: 160, alpha: 1}}}).png().toBuffer();
});

function row() {
  return {
    id: mediaId, url: `/api/media/${mediaId}`, storageKey: "media/2026/10/logo.png", storageEtag: '"etag"',
    contentType: "image/png", byteSize: png.length, checksumSha256: createHash("sha256").update(png).digest("hex"), archivedAt: null,
  };
}

function handlerFor(load: () => Promise<unknown>) {
  const stored = row();
  const get = vi.fn(async () => ({
    body: new ReadableStream<Uint8Array>({start(controller) { controller.enqueue(png); controller.close(); }}),
    etag: stored.storageEtag, contentLength: stored.byteSize, contentType: stored.contentType, sha256: stored.checksumSha256,
  }));
  return {get, handler: createMediaGet({load: vi.fn(load) as never, storage: {get} as never})};
}

const call = (handler: ReturnType<typeof createMediaGet>, query: string) =>
  handler(new Request(`https://www.hkwtia.org/api/media/${mediaId}${query}`), {params: Promise.resolve({id: mediaId})});

describe("media delivery widths", () => {
  it("returns a resized WebP for an allowed width, with the same CDN caching", async () => {
    const {handler} = handlerFor(async () => row());
    const response = await call(handler, "?w=320&dpl=dpl_example");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=300, must-revalidate");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(Number(response.headers.get("content-length"))).toBe(bytes.length);
    const meta = await sharp(bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(320);
    expect(bytes.length).toBeLessThan(png.length);
  });

  it("resizes a large original down to the largest allowed width", async () => {
    const {handler} = handlerFor(async () => row());
    const meta = await sharp(Buffer.from(await (await call(handler, "?w=960")).arrayBuffer())).metadata();
    expect(meta.width).toBe(960);
  });

  it("refuses widths outside the list without caching the answer", async () => {
    const {handler, get} = handlerFor(async () => row());
    for (const query of ["?w=333", "?w=0", "?w=abc", "?w=320&w=640"]) {
      const response = await call(handler, query);
      expect(response.status, query).toBe(404);
      expect(response.headers.get("cache-control"), query).toBe("no-store");
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("still refuses archived media when a width is asked for", async () => {
    const {handler, get} = handlerFor(async () => null);
    const response = await call(handler, "?w=320");
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(get).not.toHaveBeenCalled();
  });

  it("serves the verified original unchanged without a width", async () => {
    const {handler} = handlerFor(async () => row());
    const response = await call(handler, "");
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await response.arrayBuffer()).equals(png)).toBe(true);
  });
});

describe("mediaDeliverySrc", () => {
  it("adds a width only to uploaded-media delivery URLs", () => {
    expect(MEDIA_DELIVERY_WIDTHS).toEqual([160, 320, 480, 640, 960]);
    expect(mediaDeliverySrc(`/api/media/${mediaId}`, 640)).toBe(`/api/media/${mediaId}?w=640`);
    expect(mediaDeliverySrc("/images/partners/hkaa.png", 640)).toBe("/images/partners/hkaa.png");
    expect(mediaDeliverySrc("https://example.org/logo.png", 640)).toBe("https://example.org/logo.png");
  });
});
