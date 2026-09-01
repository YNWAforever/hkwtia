import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import {wisetechIntegrationProvenance} from "@/config/wisetech-integration-manifest";

describe("WiseTech donor asset provenance", () => {
  it("tracks the exact pinned logo bytes at the own-origin destination", () => {
    const logo = wisetechIntegrationProvenance.site.currentDonor.logo;
    const bytes = readFileSync(resolve(process.cwd(), logo.canonicalPath));
    const sha256 = createHash("sha256").update(bytes).digest("hex").toUpperCase();

    expect(sha256).toBe(logo.sha256);
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});