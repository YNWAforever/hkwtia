import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

describe("partner migration and import evidence", () => {
  const evidence = readFileSync("docs/integration/wisetech-pr4-migration-and-import.md", "utf8");
  const migration = readFileSync("drizzle/0020_wisetech_partners.sql", "utf8");

  it("documents Hong Kong-current relationship and archived-media-reference verification", () => {
    for (const source of [evidence, migration]) {
      expect(source).toContain("AT TIME ZONE 'Asia/Hong_Kong'");
      expect(source).toContain("relationship_starts_on");
      expect(source).toContain("relationship_ends_on");
      expect(source).toContain("m.archived_at IS NOT NULL");
    }
  });

  it("uses JavaScript-compatible nonblank bilingual alt verification", () => {
    for (const source of [evidence, migration]) {
      expect(source).toContain("U&'\\0009\\000A");
      expect(source).toContain("m.alt_en");
      expect(source).toContain("m.alt_zh");
    }
  });

  it("specifies distinct zero-row import schemas for both partner authorities", () => {
    expect(evidence).toContain("external_key,name_en,name_zh_hk,category,website_url");
    expect(evidence).toContain("external_key,organization_en,organization_zh_hk,market,region,mou_status,contact_json,notes,publish");
  });
});
