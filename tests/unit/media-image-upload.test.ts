import {createHash} from "node:crypto";

import sharp from "sharp";
import {describe, expect, it} from "vitest";

import {exifGpsJpegFixture} from "@/tests/fixtures/exif-gps-image";

import {
  MAX_MEDIA_BYTES,
  normalizeImageUpload,
  validateImageUploadFields,
} from "@/lib/media/image-upload";

const fields = {
  filename: "partner-logo.png",
  altEn: "Partner logo",
  altZh: "合作夥伴標誌",
  focalX: "50",
  focalY: "25",
};

async function raster(format: "png" | "jpeg" | "webp" = "png") {
  const pipeline = sharp({
    create: {width: 2, height: 3, channels: 4, background: {r: 10, g: 20, b: 30, alpha: 1}},
  });
  return pipeline.toFormat(format).toBuffer();
}

describe("media upload field contracts", () => {
  it("accepts exact filename/alt/focal boundaries", () => {
    expect(validateImageUploadFields({
      filename: "a".repeat(255), altEn: "a".repeat(300), altZh: "中".repeat(300),
      focalX: "0", focalY: "100",
    })).toMatchObject({focalX: 0, focalY: 100});
  });

  it.each([
    ["filename", " a.png"], ["filename", "a/b.png"], ["filename", "a\\b.png"],
    ["filename", "e\u0301.png"], ["filename", "x\u202Ey.png"], ["filename", "x\u0085y.png"],
    ["altEn", " Partner"], ["altEn", "e\u0301"], ["altZh", "x\u2066y"],
  ])("rejects noncanonical or unsafe %s", (name, value) => {
    expect(() => validateImageUploadFields({...fields, [name]: value}))
      .toThrowError(/MEDIA_UPLOAD_FIELDS_INVALID/);
  });

  it.each([["focalX", "-0.1"], ["focalY", "100.1"], ["focalX", ""], ["focalY", "NaN"], ["focalX", "25.5"]])(
    "rejects invalid %s",
    (name, value) => expect(() => validateImageUploadFields({...fields, [name]: value}))
      .toThrowError(/MEDIA_UPLOAD_FIELDS_INVALID/),
  );
});

describe("media raster normalization", () => {
  it.each([
    ["image/png", "png"], ["image/jpeg", "jpeg"], ["image/webp", "webp"],
  ] as const)("decodes and re-encodes %s to the same family", async (contentType, format) => {
    const result = await normalizeImageUpload(await raster(format), contentType, fields, {
      now: () => new Date("2026-08-28T04:00:00.000Z"),
      uuid: () => "11111111-1111-4111-8111-111111111111",
    });

    expect(result).toMatchObject({
      contentType,
      width: 2,
      height: 3,
      byteSize: result.bytes.byteLength,
      objectKey: `media/2026/08/11111111-1111-4111-8111-111111111111.${format === "jpeg" ? "jpg" : format}`,
    });
    expect(result.sha256).toBe(createHash("sha256").update(result.bytes).digest("hex"));
    expect((await sharp(result.bytes).metadata()).format).toBe(format);
  });

  it("rejects declared MIME and magic mismatches, SVG, animation, and malformed bytes", async () => {
    const png = await raster("png");
    await expect(normalizeImageUpload(png, "image/jpeg", fields)).rejects.toThrow(/MEDIA_IMAGE_INVALID/);
    await expect(normalizeImageUpload(Buffer.from("<svg><script>alert(1)</script></svg>"), "image/png", fields))
      .rejects.toThrow(/MEDIA_IMAGE_INVALID/);
    await expect(normalizeImageUpload(Buffer.from("not-an-image"), "image/png", fields))
      .rejects.toThrow(/MEDIA_IMAGE_INVALID/);

    const animated = await sharp([
      {create: {width: 1, height: 1, channels: 4, background: "red"}},
      {create: {width: 1, height: 1, channels: 4, background: "blue"}},
    ] as unknown as Parameters<typeof sharp>[0], {join: {animated: true}})
      .webp({loop: 0, delay: [100, 100]}).toBuffer();
    await expect(normalizeImageUpload(animated, "image/webp", fields))
      .rejects.toThrow(/MEDIA_IMAGE_INVALID/);
  });

  it("auto-orients and strips EXIF/GPS metadata", async () => {
    const withMetadata = await exifGpsJpegFixture();
    expect((await sharp(withMetadata).metadata()).exif).toBeDefined();

    const result = await normalizeImageUpload(withMetadata, "image/jpeg", {
      ...fields, filename: "fixture.jpg",
    });
    const metadata = await sharp(result.bytes).metadata();
    expect({width: metadata.width, height: metadata.height}).toEqual({width: 3, height: 2});
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
  });

  it("rejects input and normalized output over the exact cap", async () => {
    await expect(normalizeImageUpload(new Uint8Array(MAX_MEDIA_BYTES + 1), "image/png", fields))
      .rejects.toThrow(/MEDIA_IMAGE_INVALID/);

    const oversized = Buffer.alloc(MAX_MEDIA_BYTES + 1);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(oversized);
    await expect(normalizeImageUpload(await raster("png"), "image/png", fields, {
      encode: async () => ({data: oversized, info: {width: 2, height: 3}}),
    })).rejects.toThrow(/MEDIA_IMAGE_INVALID/);
  });

  it("rejects dimensions over 10,000 and more than 40 million pixels before decoding", async () => {
    const tooWide = await sharp({
      create: {width: 10_001, height: 1, channels: 3, background: "red"},
    }).png().toBuffer();
    await expect(normalizeImageUpload(tooWide, "image/png", fields))
      .rejects.toThrow(/MEDIA_IMAGE_INVALID/);

    const tooManyPixels = await sharp({
      create: {width: 8_000, height: 5_001, channels: 3, background: "red"},
    }).png({compressionLevel: 9}).toBuffer();
    await expect(normalizeImageUpload(tooManyPixels, "image/png", fields))
      .rejects.toThrow(/MEDIA_IMAGE_INVALID/);
  }, 20_000);
});
