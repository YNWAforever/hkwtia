import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {wisetechIntegrationProvenance} from "@/config/wisetech-integration-manifest";

function sha256Of(path: string): Readonly<{bytes: Buffer; sha256: string}> {
  const bytes = readFileSync(resolve(process.cwd(), path));
  return {bytes, sha256: createHash("sha256").update(bytes).digest("hex").toUpperCase()};
}

describe("WiseTech donor asset provenance", () => {
  it("tracks the exact pinned logo bytes at the own-origin destination", () => {
    const logo = wisetechIntegrationProvenance.site.currentDonor.logo;
    const {bytes, sha256} = sha256Of(logo.canonicalPath);

    expect(sha256).toBe(logo.sha256);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  });

  // The ported photographs keep the donor's own paths so the byte-pinned CSS port
  // (app/styles/wisetech.css) resolves them without edits. Each is pinned by sha256 like the
  // logo: restyle the usage, never the file.
  it("tracks the exact pinned bytes of every ported donor photograph", () => {
    const photos = wisetechIntegrationProvenance.site.currentDonor.photos;
    expect(photos.length).toBeGreaterThanOrEqual(5);
    for (const photo of photos) {
      const {bytes, sha256} = sha256Of(photo.canonicalPath);
      expect(sha256, photo.canonicalPath).toBe(photo.sha256);
      expect(bytes.subarray(0, 4).toString("ascii"), photo.canonicalPath).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString("ascii"), photo.canonicalPath).toBe("WEBP");
      expect(photo.canonicalPath, photo.sourcePath).toBe(photo.sourcePath);
      expect(photo.confirmation, photo.canonicalPath).toContain("2026-09-07");
    }
  });
});
