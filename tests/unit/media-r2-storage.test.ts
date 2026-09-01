import {DeleteObjectCommand, GetObjectCommand, PutObjectCommand} from "@aws-sdk/client-s3";
import {describe, expect, it, vi} from "vitest";

import {createR2Storage, resolveR2Config} from "@/lib/media/r2-storage";

const baseEnvironment = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  R2_JURISDICTION: "default",
  R2_ACCESS_KEY_ID: "access-key",
  R2_SECRET_ACCESS_KEY: "secret-key",
  R2_BUCKET: "private-media",
};

describe("private R2 configuration", () => {
  it.each([
    ["default", "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com"],
    ["eu", "https://0123456789abcdef0123456789abcdef.eu.r2.cloudflarestorage.com"],
    ["us", "https://0123456789abcdef0123456789abcdef.us.r2.cloudflarestorage.com"],
    ["fedramp", "https://0123456789abcdef0123456789abcdef.fedramp.r2.cloudflarestorage.com"],
  ])("generates the fixed %s jurisdiction endpoint", (jurisdiction, endpoint) => {
    expect(resolveR2Config({...baseEnvironment, R2_JURISDICTION: jurisdiction})).toMatchObject({
      endpoint, region: "auto", bucket: "private-media",
    });
  });

  it.each(["", "EU", "auto", "../../host", "default "])("rejects jurisdiction %s", (jurisdiction) => {
    expect(() => resolveR2Config({...baseEnvironment, R2_JURISDICTION: jurisdiction}))
      .toThrow("R2_CONFIGURATION_INVALID");
  });

  it("is lazy and fails missing configuration only on attempted I/O", async () => {
    const send = vi.fn();
    const storage = createR2Storage({environment: {}, send});
    expect(send).not.toHaveBeenCalled();
    await expect(storage.delete("media/2026/08/id.png")).rejects.toThrow("R2_CONFIGURATION_INVALID");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("private R2 operations", () => {
  it("puts normalized bytes with no-store and sha256 metadata, requiring an ETag", async () => {
    const send = vi.fn(async (command: unknown) => {
      expect(command).toBeInstanceOf(PutObjectCommand);
      const input = (command as PutObjectCommand).input;
      expect(input).toMatchObject({
        Bucket: "private-media", Key: "media/2026/08/id.png", ContentType: "image/png",
        CacheControl: "no-store", Metadata: {sha256: "a".repeat(64)},
      });
      expect(input).not.toHaveProperty("ChecksumSHA256");
      return {ETag: '"provider-etag"'};
    });
    const storage = createR2Storage({environment: baseEnvironment, send});
    await expect(storage.put({
      key: "media/2026/08/id.png", bytes: Buffer.from("png"), contentType: "image/png",
      sha256: "a".repeat(64),
    })).resolves.toEqual({etag: '"provider-etag"'});

    const missing = createR2Storage({environment: baseEnvironment, send: vi.fn(async () => ({}))});
    await expect(missing.put({
      key: "media/2026/08/id.png", bytes: Buffer.from("png"), contentType: "image/png",
      sha256: "a".repeat(64),
    })).rejects.toThrow("R2_ETAG_REQUIRED");
  });

  it("gets with IfMatch and returns a web stream plus provider metadata", async () => {
    const send = vi.fn(async (command: unknown) => {
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect((command as GetObjectCommand).input).toMatchObject({
        Bucket: "private-media", Key: "media/2026/08/id.png", IfMatch: '"etag"',
      });
      return {
        Body: {transformToWebStream: () => new ReadableStream<Uint8Array>({
          start(controller) { controller.enqueue(new TextEncoder().encode("body")); controller.close(); },
        })},
        ETag: '"etag"', ContentLength: 4, ContentType: "image/png", Metadata: {sha256: "b".repeat(64)},
      };
    });
    const storage = createR2Storage({environment: baseEnvironment, send});
    const result = await storage.get({key: "media/2026/08/id.png", etag: '"etag"'});
    expect(result).toMatchObject({
      etag: '"etag"', contentLength: 4, contentType: "image/png", sha256: "b".repeat(64),
    });
    expect(await new Response(result.body).text()).toBe("body");
  });

  it("deletes by exact generated key and normalizes provider failures", async () => {
    const send = vi.fn(async (command: unknown) => {
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect((command as DeleteObjectCommand).input).toMatchObject({
        Bucket: "private-media", Key: "media/2026/08/id.png",
      });
      throw new Error("provider detail must not escape");
    });
    const storage = createR2Storage({environment: baseEnvironment, send});
    await expect(storage.delete("media/2026/08/id.png")).rejects.toThrow("R2_STORAGE_FAILED");
  });
});
