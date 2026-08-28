import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {setMediaArchived, type MediaMutationDependencies} from "@/lib/db/repos/media";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const id = "11111111-1111-4111-8111-111111111111";

describe("partner and Showcase media locking", () => {
  it("refuses archive when a general partner references the locked media row", async () => {
    const tx = {findByUrl: async () => null, insertMedia: async () => null as never,
      lockMedia: async () => ({id, url: "/logo.png", altEn: "Logo", altZh: "標誌", archivedAt: null}) as never,
      updateMedia: async () => null, countListingReferences: async () => 0,
      countPartnerReferences: async () => 1, setArchivedAt: async () => null,
      insertAudit: async () => undefined};
    const dependencies: MediaMutationDependencies = {transaction: (work) => work(tx as never)};
    await expect(setMediaArchived(staff, id, true, dependencies)).rejects.toThrow("MEDIA_IN_USE");
    expect(await tx.countPartnerReferences()).toBe(1);
  });

  it("locks media before the Showcase attachment update", () => {
    const source = readFileSync("lib/db/repos/showcase.ts", "utf8");
    const method = source.slice(source.indexOf("async setLogoMedia(id, mediaId)"), source.indexOf("async listPublished", source.indexOf("async setLogoMedia(id, mediaId)")));
    expect(method).toContain('.for("update")');
    expect(method.indexOf('.for("update")')).toBeLessThan(method.indexOf("update(showcaseListings)"));
    expect(method).toContain("archivedAt");
  });
});
