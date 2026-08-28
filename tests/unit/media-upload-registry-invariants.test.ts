import {describe, expect, it, vi} from "vitest";

import {updateMedia, type MediaMutationDependencies} from "@/lib/db/repos/media";

const staff = {kind: "staff", userId: "staff-user", profileId: "staff-profile"} as const;
const id = "22222222-2222-4222-8222-222222222222";

function uploadedRow() {
  return {
    id,
    url: `/api/media/${id}`,
    altEn: "Partner logo",
    altZh: "合作夥伴標誌",
    storageKey: "media/2026/08/11111111-1111-4111-8111-111111111111.png",
    storageEtag: '"etag"', originalFilename: "logo.png", contentType: "image/png",
    byteSize: 100, width: 10, height: 10, focalX: 50, focalY: 50,
    checksumSha256: "a".repeat(64), registeredByProfileId: "staff-profile",
    archivedAt: null, createdAt: new Date(), updatedAt: new Date(),
  };
}

describe("uploaded media registry invariants", () => {
  it("never lets the manual editor move an uploaded row away from its revocation-aware URL", async () => {
    const update = vi.fn();
    const dependencies = {
      transaction: async (work: (value: unknown) => Promise<unknown>) => work({
        lockMedia: vi.fn(async () => uploadedRow()),
        findByUrl: vi.fn(async () => null),
        updateMedia: update,
        insertAudit: vi.fn(),
      }),
    } as MediaMutationDependencies;

    await expect(updateMedia(staff, id, {url: "/images/replaced.png"}, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: ["url"], message: "MEDIA_UPLOAD_URL_IMMUTABLE"})]});
    expect(update).not.toHaveBeenCalled();
  });
});
