import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it, vi} from "vitest";

import {
  createAnnouncement,
  type AnnouncementMutationDependencies,
} from "@/lib/db/repos/announcements";

const staff = {kind: "staff", userId: "user-staff", profileId: "profile-staff"} as const;
const hostileWhitespace = "\t\n\v\f\r \u00a0\u1680\u2000\u2007\u200a\u2028\u2029\u202f\u205f\u3000\ufeff";
const jsTrimCharactersSql = "U&'\\0009\\000A\\000B\\000C\\000D\\0020\\00A0\\1680\\2000\\2001\\2002\\2003\\2004\\2005\\2006\\2007\\2008\\2009\\200A\\2028\\2029\\202F\\205F\\3000\\FEFF'";
const validInput = {
  titleEn: "Applications are open",
  titleZhHk: "現正接受申請",
  ctaLabelEn: "View programme",
  ctaLabelZhHk: "查看計劃",
  href: "/launchpad",
  startsAt: new Date("2026-08-28T00:00:00.000Z"),
  endsAt: new Date("2026-08-29T00:00:00.000Z"),
  priority: 50,
};

function dependencies() {
  const insertAnnouncement = vi.fn(async (input: Record<string, unknown>) => ({
    id: "11111111-1111-4111-8111-111111111111",
    ...input,
  }));
  const transaction = {
    insertAnnouncement,
    insertAudit: vi.fn(async () => undefined),
  };
  const value: AnnouncementMutationDependencies = {
    transaction: (work) => work(transaction as never),
  };
  return {value, insertAnnouncement};
}

describe("announcement JavaScript-trim contract", () => {
  it.each(["titleEn", "titleZhHk", "ctaLabelEn", "ctaLabelZhHk"] as const)(
    "rejects %s containing only ECMAScript whitespace before insertion",
    async (field) => {
      const target = dependencies();
      await expect(createAnnouncement(staff, {
        ...validInput,
        [field]: hostileWhitespace,
      }, target.value)).rejects.toMatchObject({
        issues: [expect.objectContaining({path: [field]})],
      });
      expect(target.insertAnnouncement).not.toHaveBeenCalled();
    },
  );

  it("trims hostile ASCII and Unicode whitespace before enforcing code-point bounds", async () => {
    const target = dependencies();
    await createAnnouncement(staff, {
      ...validInput,
      titleEn: `${hostileWhitespace}${"a".repeat(180)}${hostileWhitespace}`,
      ctaLabelEn: `${hostileWhitespace}${"🚀".repeat(60)}${hostileWhitespace}`,
    }, target.value);

    expect(target.insertAnnouncement).toHaveBeenCalledWith(expect.objectContaining({
      titleEn: "a".repeat(180),
      ctaLabelEn: "🚀".repeat(60),
    }));
  });

  it("keeps generated migration, snapshot, and verification SQL on the immutable JS-trim character set", () => {
    const migration = readFileSync(join(process.cwd(), "drizzle", "0019_wisetech_announcements.sql"), "utf8");
    const snapshot = JSON.parse(readFileSync(
      join(process.cwd(), "drizzle", "meta", "0019_snapshot.json"),
      "utf8",
    )) as {tables: Record<string, {checkConstraints: Record<string, {value: string}>}>};
    const evidence = readFileSync(
      join(process.cwd(), "docs", "integration", "wisetech-pr4-migration-and-import.md"),
      "utf8",
    );

    expect(migration.match(new RegExp(jsTrimCharactersSql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")))
      .toHaveLength(4);
    expect(migration).not.toMatch(/char_length\(btrim\(\"site_announcements\"\.\"(?:title_en|title_zh_hk|cta_label_en|cta_label_zh_hk)\"\)\)/);

    const checks = snapshot.tables["public.site_announcements"].checkConstraints;
    for (const name of [
      "site_announcements_title_en_check",
      "site_announcements_title_zh_hk_check",
      "site_announcements_cta_label_en_check",
      "site_announcements_cta_label_zh_hk_check",
    ]) {
      expect(checks[name].value).toContain(jsTrimCharactersSql);
    }
    expect(evidence.match(new RegExp(jsTrimCharactersSql.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")))
      .toHaveLength(4);
  });
});
