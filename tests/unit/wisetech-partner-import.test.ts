import {describe, expect, it, vi} from "vitest";

import {importPartners, type PartnerImportDependencies} from "@/scripts/import-wisetech-partners";

const donorPartners = [
  {name: "Harbour Trade Council", category: "supporting" as const, logoFile: "harbour-trade.png"},
  {name: "GBA Media Group", category: "media" as const, website: "https://example.org", logoFile: "gba-media.png"},
];

function fakeDependencies(overrides: Partial<PartnerImportDependencies> = {}): PartnerImportDependencies {
  const existing = new Set<string>();

  return {
    findExisting: vi.fn(async (category: string, nameEn: string) => existing.has(`${category}:${nameEn}`)),
    readLogoBytes: vi.fn(async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    normalizeImage: vi.fn(async (_bytes, _contentType, fields) => ({
      filename: fields.filename,
      altEn: fields.altEn,
      altZh: fields.altZh,
      // NormalizedImageUpload.focalX/focalY are numbers (the parsed output); the incoming
      // fieldInput carries them as strings (normalizeImageUpload's real input shape, meant for
      // raw un-parsed form data) -- this fake must convert, not merely pass the strings through,
      // or the fake's return value would not actually satisfy NormalizedImageUpload's type.
      focalX: Number(fields.focalX),
      focalY: Number(fields.focalY),
      bytes: Buffer.from("normalized"),
      contentType: "image/png" as const,
      width: 200,
      height: 200,
      byteSize: 10,
      sha256: "deadbeef",
      objectKey: `media/2026/09/${fields.filename}`,
    })),
    uploadLogo: vi.fn(async () => ({etag: "\"fake-etag\""})),
    transaction: vi.fn(async (work) => work({
      insertMedia: async (row: unknown) => ({id: `media-generated`}),
      insertPartner: async (row: unknown) => ({id: `partner-generated`}),
      insertAudit: async (row: unknown) => {},
    })),
    generateId: vi.fn(() => `generated-id`),
    log: vi.fn(),
    ...overrides,
  };
}

describe("importPartners", () => {
  it("inserts one media row and one partner row per new donor record, in a single transaction each", async () => {
    const insertedPartners: unknown[] = [];
    const insertedMedia: unknown[] = [];
    const insertedAudit: unknown[] = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async (row) => { insertedMedia.push(row); return {id: `media-${insertedMedia.length}`}; },
        insertPartner: async (row) => { insertedPartners.push(row); return {id: `partner-${insertedPartners.length}`}; },
        insertAudit: async (row) => { insertedAudit.push(row); },
      }),
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary).toEqual({created: 2, skippedExisting: 0, skippedError: 0});
    expect(insertedMedia).toHaveLength(2);
    expect(insertedPartners).toHaveLength(2);
    expect(insertedAudit).toHaveLength(2);
  });

  it("creates rows with published_at and both confirmed_at columns unset (null)", async () => {
    const insertedPartners: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: "partner-1"}; },
        insertAudit: async () => {},
      }),
    });

    await importPartners([donorPartners[0]!], new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedPartners[0]!.publishedAt).toBeUndefined();
    expect(insertedPartners[0]!.relationshipConfirmedAt).toBeUndefined();
    expect(insertedPartners[0]!.logoRightsConfirmedAt).toBeUndefined();
  });

  it("gives the media row non-blank bilingual alt text derived from the partner name", async () => {
    const insertedMedia: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async (row) => { insertedMedia.push(row); return {id: "media-1"}; },
        insertPartner: async () => ({id: "partner-1"}),
        insertAudit: async () => {},
      }),
    });

    await importPartners([donorPartners[0]!], new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedMedia[0]!.altEn).toBe("Harbour Trade Council logo");
    expect(insertedMedia[0]!.altZh).toBe("Harbour Trade Council 標誌");
  });

  it("maps the donor's three categories onto the partners table's category enum exactly", async () => {
    const insertedPartners: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: `partner-${insertedPartners.length}`}; },
        insertAudit: async () => {},
      }),
    });

    await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedPartners[0]!.category).toBe("supporting");
    expect(insertedPartners[1]!.category).toBe("media");
  });

  it("is idempotent on (category, nameEn): a second run against the same donor data inserts 0 rows", async () => {
    const existing = new Set(["supporting:Harbour Trade Council", "media:GBA Media Group"]);
    const deps = fakeDependencies({
      findExisting: async (category, nameEn) => existing.has(`${category}:${nameEn}`),
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary).toEqual({created: 0, skippedExisting: 2, skippedError: 0});
  });

  it("resolves the Chinese name from the sidecar, falling back to English when absent", async () => {
    const insertedPartners: Array<Record<string, unknown>> = [];
    const deps = fakeDependencies({
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: `partner-${insertedPartners.length}`}; },
        insertAudit: async () => {},
      }),
    });
    const sidecar = new Map([["Harbour Trade Council", "港口貿易協會"]]);

    await importPartners(donorPartners, sidecar, {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(insertedPartners[0]!.nameZhHk).toBe("港口貿易協會");
    expect(insertedPartners[1]!.nameZhHk).toBe("GBA Media Group");
  });

  it("logs and skips a record whose logo fails validation, without aborting the whole run", async () => {
    let call = 0;
    const insertedPartners: unknown[] = [];
    const deps = fakeDependencies({
      normalizeImage: async () => {
        call += 1;
        if (call === 1) throw new Error("MEDIA_IMAGE_INVALID");
        return {
          filename: "gba-media.png", altEn: "x", altZh: "x", focalX: 50, focalY: 50,
          bytes: Buffer.from("ok"), contentType: "image/png" as const, width: 10, height: 10,
          byteSize: 2, sha256: "abc", objectKey: "media/2026/09/gba-media.png",
        };
      },
      transaction: async (work) => work({
        insertMedia: async () => ({id: "media-1"}),
        insertPartner: async (row) => { insertedPartners.push(row); return {id: "partner-1"}; },
        insertAudit: async () => {},
      }),
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary).toEqual({created: 1, skippedExisting: 0, skippedError: 1});
    expect(insertedPartners).toHaveLength(1);
  });

  it("never logs a raw Error.message, since a real ENOENT embeds the operator's filesystem path and the partner's logo filename", async () => {
    const logged: string[] = [];
    const leakyPath = "C:\\Users\\operator\\donor\\public\\partners\\acme-corp-logo.png";
    const deps = fakeDependencies({
      log: (message: string) => { logged.push(message); },
      readLogoBytes: async () => {
        throw new Error(`ENOENT: no such file or directory, open '${leakyPath}'`);
      },
    });

    const summary = await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    expect(summary.skippedError).toBe(donorPartners.length);
    for (const line of logged) {
      expect(line).not.toContain(leakyPath);
      expect(line).not.toContain("acme-corp-logo.png");
      expect(line).not.toContain("ENOENT");
      expect(line).not.toContain("operator");
    }
    expect(logged.some((line) => line.includes("skipped one record: Error"))).toBe(true);
  });

  it("prints only a running count, never a name, URL, or secret", async () => {
    const logged: string[] = [];
    const deps = fakeDependencies({log: (message: string) => { logged.push(message); }});

    await importPartners(donorPartners, new Map(), {actorProfileId: "staff-1", actorKind: "staff"}, deps);

    for (const line of logged) {
      expect(line).not.toMatch(/https?:\/\//);
      expect(line).not.toContain("Harbour Trade Council");
      expect(line).not.toContain("GBA Media Group");
    }
  });
});
