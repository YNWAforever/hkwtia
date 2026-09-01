import {createHash} from "node:crypto";

import {describe, expect, it, vi} from "vitest";

import {createMediaUploadPost} from "@/lib/admin/media-upload-route";
import {createMediaGet} from "@/lib/media/media-delivery-route";

const mediaId = "22222222-2222-4222-8222-222222222222";
const staff = {kind: "staff", userId: "staff-user", profileId: "staff-profile"} as const;

function bodyStream(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(bytes); controller.close(); },
  });
}

function uploadRequest(overrides: RequestInit = {}) {
  const body = Buffer.from("raw");
  return new Request(
    `https://www.hkwtia.org/api/admin/media/upload?filename=logo.png&altEn=Partner%20logo&altZh=%E5%90%88%E4%BD%9C%E5%A4%A5%E4%BC%B4%E6%A8%99%E8%AA%8C&focalX=50&focalY=25`,
    {
      method: "POST",
      headers: {origin: "https://www.hkwtia.org", "content-type": "image/png", "content-length": String(body.length)},
      body,
      ...overrides,
    },
  );
}

describe("POST /api/admin/media/upload", () => {
  it("authorizes before URL query access or body reading", async () => {
    const upload = vi.fn();
    const handler = createMediaUploadPost({
      actor: async () => { throw new Error("FORBIDDEN"); },
      expectedOrigin: () => "https://www.hkwtia.org",
      upload,
    });
    const hostile = new Proxy(uploadRequest(), {
      get(target, property) {
        if (property === "url" || property === "body") throw new Error("PARSED_BEFORE_AUTH");
        return Reflect.get(target, property, target);
      },
    });
    expect((await handler(hostile)).status).toBe(404);
    expect(upload).not.toHaveBeenCalled();
  });

  it("requires exact configured same-origin before body reading", async () => {
    const upload = vi.fn();
    const handler = createMediaUploadPost({
      actor: async () => staff,
      expectedOrigin: () => "https://www.hkwtia.org",
      upload,
    });
    const response = await handler(uploadRequest({headers: {
      origin: "https://www.hkwtia.org.attacker.test", "content-type": "image/png", "content-length": "3",
    }}));
    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it("passes exact raw bytes and query fields to the upload service", async () => {
    const upload = vi.fn(async () => ({id: mediaId, url: `/api/media/${mediaId}`}));
    const handler = createMediaUploadPost({
      actor: async () => staff,
      expectedOrigin: () => "https://www.hkwtia.org",
      upload,
    });
    const response = await handler(uploadRequest());
    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledWith(staff, {
      bytes: new Uint8Array(Buffer.from("raw")),
      contentType: "image/png",
      fields: {
        filename: "logo.png", altEn: "Partner logo", altZh: "合作夥伴標誌", focalX: "50", focalY: "25",
      },
    });
  });

  it.each([
    [uploadRequest({headers: {origin: "https://www.hkwtia.org", "content-type": "image/png"}}), 400],
    [uploadRequest({headers: {origin: "https://www.hkwtia.org", "content-type": "image/png", "content-length": "0"}}), 400],
  ])("returns a generic client error for invalid bounded input", async (request, status) => {
    const handler = createMediaUploadPost({
      actor: async () => staff, expectedOrigin: () => "https://www.hkwtia.org", upload: vi.fn(),
    });
    const response = await handler(request);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({error: "INVALID_MEDIA_UPLOAD"});
  });
});

function uploadedRow(overrides: Record<string, unknown> = {}) {
  const bytes = Buffer.from("verified image body");
  return {
    id: mediaId, url: `/api/media/${mediaId}`, altEn: "Partner logo", altZh: "合作夥伴標誌",
    storageKey: "media/2026/08/11111111-1111-4111-8111-111111111111.png",
    storageEtag: '\"etag\"', originalFilename: "private-original.png", contentType: "image/png",
    byteSize: bytes.length, width: 10, height: 10, focalX: 50, focalY: 50,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"), archivedAt: null,
    bytes,
    ...overrides,
  };
}

describe("GET /api/media/[id]", () => {
  it("404s malformed, missing, registry-only, and archived rows before provider access", async () => {
    const get = vi.fn();
    const handler = createMediaGet({load: vi.fn(async () => null), storage: {get} as never});
    for (const id of ["not-a-uuid", mediaId]) {
      expect((await handler(new Request(`https://www.hkwtia.org/api/media/${id}`), {params: Promise.resolve({id})})).status)
        .toBe(404);
    }
    expect(get).not.toHaveBeenCalled();
  });

  it("uses stored ETag and streams verified bytes with exact private headers", async () => {
    const row = uploadedRow();
    const get = vi.fn(async () => ({
      body: bodyStream(row.bytes), etag: row.storageEtag, contentLength: row.byteSize,
      contentType: row.contentType, sha256: row.checksumSha256,
    }));
    const handler = createMediaGet({load: vi.fn(async () => row as never), storage: {get} as never});
    const response = await handler(new Request(`https://www.hkwtia.org/api/media/${mediaId}`), {
      params: Promise.resolve({id: mediaId}),
    });
    expect(get).toHaveBeenCalledWith({key: row.storageKey, etag: row.storageEtag});
    expect(response.status).toBe(200);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "cache-control": "no-store", "content-disposition": "inline", "content-length": String(row.byteSize),
      "content-type": "image/png", etag: row.storageEtag, "x-content-type-options": "nosniff",
    });
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(await response.text()).toBe(row.bytes.toString());
  });

  it.each([
    ["etag", {etag: '\"other\"'}], ["length", {contentLength: 1}], ["type", {contentType: "image/jpeg"}],
    ["metadata checksum", {sha256: "0".repeat(64)}], ["body checksum", {body: bodyStream("changed")}],
    ["missing body", {body: null}],
  ])("maps %s integrity mismatch to 404", async (_case, mismatch) => {
    const row = uploadedRow();
    const object = {
      body: bodyStream(row.bytes), etag: row.storageEtag, contentLength: row.byteSize,
      contentType: row.contentType, sha256: row.checksumSha256, ...mismatch,
    };
    const handler = createMediaGet({
      load: vi.fn(async () => row as never), storage: {get: vi.fn(async () => object)} as never,
    });
    expect((await handler(new Request(`https://www.hkwtia.org/api/media/${mediaId}`), {
      params: Promise.resolve({id: mediaId}),
    })).status).toBe(404);
  });

  it("rechecks revocation on every request", async () => {
    const row = uploadedRow();
    const load = vi.fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(null);
    const get = vi.fn(async () => ({
      body: bodyStream(row.bytes), etag: row.storageEtag, contentLength: row.byteSize,
      contentType: row.contentType, sha256: row.checksumSha256,
    }));
    const handler = createMediaGet({load, storage: {get} as never});
    expect((await handler(new Request(`https://www.hkwtia.org/api/media/${mediaId}`), {params: Promise.resolve({id: mediaId})})).status).toBe(200);
    expect((await handler(new Request(`https://www.hkwtia.org/api/media/${mediaId}`), {params: Promise.resolve({id: mediaId})})).status).toBe(404);
    expect(get).toHaveBeenCalledOnce();
  });
});
