import {readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";
import {runPartnerFormAction} from "@/lib/admin/partner-action-core";
import {createPartner, listPublishedPartners} from "@/lib/db/repos/partners";

const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const now = new Date("2026-08-28T16:30:00.000Z");
const mediaId = "22222222-2222-4222-8222-222222222222";
const messages = {successMessage: "Saved", validationMessage: "Check fields", errorMessage: "Try again"};
function form(websiteUrl: string): FormData { const data = new FormData(); for (const [key, value] of Object.entries({nameEn: "Partner", nameZhHk: "夥伴", category: "regional", websiteUrl, logoMediaId: mediaId, displayOrder: "5", relationshipStartsOn: "2026-08-29", relationshipEndsOn: "2026-08-29"})) data.set(key, value); data.set("relationshipConfirmed", "on"); data.set("logoRightsConfirmed", "on"); return data; }

describe("partner re-review regressions", () => {
  it.each([" https://example.com/path ", "https://example.com/e\u0301"])("preserves and rejects non-canonical raw website input %j", async (websiteUrl) => {
    const data = form(websiteUrl);
    const state = await runPartnerFormAction({}, data, {...messages, mutate: async (input) => { await createPartner(staff, input, {transaction: async () => { throw new Error("transaction must not start"); }}); }});
    expect(state).toMatchObject({status: "error", fieldErrors: {websiteUrl: "Check fields"}, values: {websiteUrl}});
  });

  it.each(["\t", "\u00a0", "\u3000"])("excludes ECMAScript-whitespace-only bilingual alts from injected projection %j", async (whitespace) => {
    const row = {id: "11111111-1111-4111-8111-111111111111", nameEn: "Partner", nameZhHk: "夥伴", category: "regional", websiteUrl: "https://example.com/", logoMediaId: mediaId, displayOrder: 0, featured: false, relationshipStartsOn: "2026-08-29", relationshipEndsOn: "2026-08-29", relationshipConfirmedAt: now, logoRightsConfirmedAt: now, publishedAt: now, archivedAt: null, createdAt: now, updatedAt: now, logoMediaUrl: "/logo", logoMediaAltEn: whitespace, logoMediaAltZh: whitespace, logoMediaArchivedAt: null};
    await expect(listPublishedPartners("en", {asOf: now}, [row] as never)).resolves.toEqual([]);
  });

  it("uses the exact ECMAScript whitespace set in both production SQL alt predicates", () => {
    const source = readFileSync("lib/db/repos/partners.ts", "utf8");
    expect(source).toContain("\\u0009\\u000a\\u000b\\u000c\\u000d\\u0020\\u00a0\\u1680\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff");
    expect(source).toMatch(/btrim\(\$\{media\.altEn\}, \$\{jsTrimCharacters\}\)/u);
    expect(source).toMatch(/btrim\(\$\{media\.altZh\}, \$\{jsTrimCharacters\}\)/u);
  });

  it("verifies archived logo references across partners and showcase listings", () => {
    for (const path of ["docs/integration/wisetech-pr4-migration-and-import.md", "drizzle/0020_wisetech_partners.sql"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("FROM partners p");
      expect(source).toContain("FROM showcase_listings s");
      expect(source).toContain("UNION ALL");
      expect(source.match(/m\.archived_at IS NOT NULL/gu)?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });
});
