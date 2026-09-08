import {describe, expect, it, vi} from "vitest";

import {createMemberMediaUploadPost, uploadMemberMedia} from "@/lib/portal/media-upload";
import type {Actor} from "@/lib/membership/lifecycle";

const member: Actor = {kind: "member", userId: "u", profileId: "member-1"};
const staff: Actor = {kind: "staff", userId: "s", profileId: "staff-1"};
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ID = "33333333-3333-4333-8333-333333333333";
const input = {bytes: png, contentType: "image/png", fields: {filename: "x.png", altEn: "x", altZh: "x", focalX: 50, focalY: 50}};

function dependencies() {
  const order: string[] = [];
  const persist = vi.fn(async (_actor: Actor, row: {id: string}) => { order.push("persist"); return {id: row.id, url: `/api/media/${row.id}`}; });
  return {
    order,
    persist,
    value: {
      normalize: vi.fn(async () => {
        order.push("normalize");
        return {bytes: png, contentType: "image/png" as const, width: 10, height: 10, byteSize: png.byteLength, sha256: "a".repeat(64), objectKey: "media/2026/09/33333333-3333-4333-8333-333333333333.png", filename: "x.png", altEn: "x", altZh: "x", focalX: 50, focalY: 50};
      }),
      storage: {put: vi.fn(async () => { order.push("put"); return {etag: "\"e\""}; }), delete: vi.fn(async () => { order.push("delete"); }), get: vi.fn()},
      persist,
      uuid: () => ID,
    },
  };
}

function uploadRequest(overrides: Readonly<{origin?: string}> = {}): Request {
  return new Request(`https://hkwtia.example/api/portal/media/upload?filename=a.png&altEn=a&altZh=a&focalX=50&focalY=50`, {
    method: "POST", body: png,
    headers: {"content-type": "image/png", "content-length": String(png.byteLength), origin: overrides.origin ?? "https://hkwtia.example"},
  });
}

describe("member media upload (programme B-2, S-3)", () => {
  it("refuses anonymous and staff actors before normalisation, storage or persistence", async () => {
    const {value, persist} = dependencies();
    await expect(uploadMemberMedia({kind: "anonymous", userId: null}, input, value as never)).rejects.toThrow("FORBIDDEN");
    // Staff use /api/admin/media/upload; the member path is member-only so a
    // staff-registered row can never carry a member's ownership stamp.
    await expect(uploadMemberMedia(staff, input, value as never)).rejects.toThrow("FORBIDDEN");
    expect(value.normalize).not.toHaveBeenCalled();
    expect(value.storage.put).not.toHaveBeenCalled();
    expect(persist).not.toHaveBeenCalled();
  });

  it("normalises, stores, then persists with the member as registrant", async () => {
    const {value, persist, order} = dependencies();
    const result = await uploadMemberMedia(member, input, value as never);
    expect(order).toEqual(["normalize", "put", "persist"]);
    expect(result).toEqual({id: ID, url: `/api/media/${ID}`});
    expect(persist).toHaveBeenCalledWith(member, expect.objectContaining({id: ID, url: `/api/media/${ID}`, storageEtag: "\"e\"", checksumSha256: "a".repeat(64)}));
  });

  it("deletes the stored object and reports a generic failure when persistence fails", async () => {
    const {value, persist, order} = dependencies();
    persist.mockRejectedValueOnce(new Error("db down"));
    await expect(uploadMemberMedia(member, input, value as never)).rejects.toThrow("MEDIA_UPLOAD_FAILED");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["normalize", "put", "delete"]);
  });

  it("answers 404 to a visitor and to staff, 403 cross-origin, and 201 to a member through the route", async () => {
    const upload = vi.fn(async () => ({id: ID, url: `/api/media/${ID}`}));
    const anonymous = createMemberMediaUploadPost({actor: async () => { throw new Error("UNAUTHORIZED"); }, expectedOrigin: () => "https://hkwtia.example", upload});
    expect((await anonymous(uploadRequest())).status).toBe(404);
    const asStaff = createMemberMediaUploadPost({actor: async () => staff, expectedOrigin: () => "https://hkwtia.example", upload});
    expect((await asStaff(uploadRequest())).status).toBe(404);
    expect(upload).not.toHaveBeenCalled();

    const asMember = createMemberMediaUploadPost({actor: async () => member, expectedOrigin: () => "https://hkwtia.example", upload});
    expect((await asMember(uploadRequest({origin: "https://hkwtia.example.attacker.test"}))).status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
    const response = await asMember(uploadRequest());
    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({id: ID, url: `/api/media/${ID}`});
    expect(upload).toHaveBeenCalledWith(member, expect.objectContaining({contentType: "image/png"}));
  });
});
