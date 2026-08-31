import {describe, expect, it, vi} from "vitest";

import {uploadMedia, type MediaUploadServiceDependencies} from "@/lib/admin/media-upload-service";
import {persistUploadedMedia, type MediaUploadMutationDependencies} from "@/lib/db/repos/media";

const staff = {kind: "staff", userId: "staff-user", profileId: "staff-profile"} as const;
const member = {kind: "member", userId: "member-user", profileId: "member-profile"} as const;
const normalized = {
  bytes: Buffer.from("normalized"),
  contentType: "image/png" as const,
  width: 100,
  height: 50,
  byteSize: 10,
  sha256: "a".repeat(64),
  objectKey: "media/2026/08/11111111-1111-4111-8111-111111111111.png",
  filename: "logo.png",
  altEn: "Partner logo",
  altZh: "合作夥伴標誌",
  focalX: 50,
  focalY: 25,
};

function dependencies(overrides: Partial<MediaUploadServiceDependencies> = {}) {
  const order: string[] = [];
  return {
    order,
    value: {
      normalize: vi.fn(async () => { order.push("normalize"); return normalized; }),
      storage: {
        put: vi.fn(async () => { order.push("put"); return {etag: '\"etag\"'}; }),
        delete: vi.fn(async () => { order.push("delete"); }),
        get: vi.fn(),
      },
      persist: vi.fn(async (_actor, input) => { order.push("persist"); return {id: input.id}; }),
      uuid: () => "22222222-2222-4222-8222-222222222222",
      ...overrides,
    } as MediaUploadServiceDependencies,
  };
}

describe("actor-first media upload service", () => {
  it("refuses a non-staff actor before validation, provider, or persistence", async () => {
    const {value} = dependencies();
    await expect(uploadMedia(member, {
      bytes: Buffer.from("raw"), contentType: "image/png", fields: normalized,
    }, value)).rejects.toThrow("FORBIDDEN");
    expect(value.normalize).not.toHaveBeenCalled();
    expect(value.storage.put).not.toHaveBeenCalled();
    expect(value.persist).not.toHaveBeenCalled();
  });

  it("normalizes, uploads, then persists exact metadata with the actor", async () => {
    const {value, order} = dependencies();
    await uploadMedia(staff, {
      bytes: Buffer.from("raw"), contentType: "image/png", fields: normalized,
    }, value);
    expect(order).toEqual(["normalize", "put", "persist"]);
    expect(value.storage.put).toHaveBeenCalledWith({
      key: normalized.objectKey, bytes: normalized.bytes,
      contentType: normalized.contentType, sha256: normalized.sha256,
    });
    expect(value.persist).toHaveBeenCalledWith(staff, {
      id: "22222222-2222-4222-8222-222222222222",
      url: "/api/media/22222222-2222-4222-8222-222222222222",
      altEn: normalized.altEn,
      altZh: normalized.altZh,
      storageKey: normalized.objectKey,
      storageEtag: '\"etag\"',
      originalFilename: normalized.filename,
      contentType: normalized.contentType,
      byteSize: normalized.byteSize,
      width: normalized.width,
      height: normalized.height,
      focalX: normalized.focalX,
      focalY: normalized.focalY,
      checksumSha256: normalized.sha256,
    });
  });

  it.each(["put", "persist"] as const)(
    "best-effort deletes the generated key after %s failure",
    async (stage) => {
      const storage = {
        put: vi.fn(async () => {
          if (stage === "put") throw new Error("R2_ETAG_REQUIRED");
          return {etag: '\"etag\"'};
        }),
        delete: vi.fn(async () => { throw new Error("delete detail"); }),
        get: vi.fn(),
      };
      const {value} = dependencies({
        storage: storage as never,
        persist: vi.fn(async () => { throw new Error("DB_FAILED"); }),
      });
      await expect(uploadMedia(staff, {
        bytes: Buffer.from("raw"), contentType: "image/png", fields: normalized,
      }, value)).rejects.toThrow("MEDIA_UPLOAD_FAILED");
      expect(storage.delete).toHaveBeenCalledWith(normalized.objectKey);
    },
  );
});

describe("transaction-audited uploaded media persistence", () => {
  it("authorizes before transaction and inserts media.uploaded audit in the same transaction", async () => {
    const insertMedia = vi.fn(async (input: Record<string, unknown>) => ({...input}));
    const insertAudit = vi.fn(async () => undefined);
    const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({insertMedia, insertAudit}));
    const deps = {transaction} as MediaUploadMutationDependencies;

    await expect(persistUploadedMedia(member, {}, deps)).rejects.toThrow("FORBIDDEN");
    expect(transaction).not.toHaveBeenCalled();

    const input = {
      id: "22222222-2222-4222-8222-222222222222",
      url: "/api/media/22222222-2222-4222-8222-222222222222",
      altEn: normalized.altEn, altZh: normalized.altZh,
      storageKey: normalized.objectKey, storageEtag: '\"etag\"', originalFilename: normalized.filename,
      contentType: normalized.contentType, byteSize: normalized.byteSize,
      width: normalized.width, height: normalized.height, focalX: 50, focalY: 25,
      checksumSha256: normalized.sha256,
    };
    await persistUploadedMedia(staff, input, deps);
    expect(insertMedia).toHaveBeenCalledWith({...input, registeredByProfileId: "staff-profile"});
    expect(insertAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: "media.uploaded", actorUserId: "staff-profile", targetId: input.id,
    }));
  });
});
