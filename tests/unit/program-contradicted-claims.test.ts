import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

/**
 * The claims in docs/wtia-content-migration-audit.md that WTIA's own archive
 * contradicts, pinned so none reaches a public page.
 *
 * These assert on the content source text rather than on rendered output
 * because the failure mode is an editor pasting a claim back in -- from the
 * audit, or from WTIA's own site, which states several of them. That is a
 * source-level event. Where a check can be behavioural instead -- funder era,
 * edition start year, which kind of regions figure an edition carries --
 * it lives in program-content.test.ts, and this file does not duplicate it.
 */
/**
 * Comments are stripped before matching, and that distinction is the whole
 * design of this file.
 *
 * These records quote the contradicted claims *deliberately* — asa.ts explains
 * that the audit read "16 regional co-organisers" off a page that says 16
 * regions attended, cpai.ts records that the 150 figure is on WTIA's own page
 * and unsubstantiated, tct.ts names Huawei and Microsoft to say no speaker from
 * either appears anywhere. That is the audit trail this project runs on, and a
 * guard that forbade it would force the reasoning out of the file.
 *
 * What must never happen is a claim reaching a *value*, because values render.
 * So: strip comments, then match.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    // `(?<!:)` keeps "https://…" in a url value intact — truncating one would
    // silently weaken every assertion that runs over the remainder.
    .replace(/(?<!:)\/\/.*$/gm, " ");
}

const SOURCES = ["asa", "hkict", "cpai", "tct"].map((id) => ({
  id,
  text: withoutComments(readFileSync(`content/programs/${id}.ts`, "utf8")),
}));

const source = (id: string) => SOURCES.find((entry) => entry.id === id)!.text;

const messages = ["en", "zh-HK"].map((locale) => ({
  locale,
  text: JSON.stringify(JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")).programs),
}));

describe("contradicted claims stay off the programme pages", () => {
  // The figure is on WTIA's own CPAI page -- "recognized by over 150 pioneering
  // companies" / 「超過150家…公司的認可」 -- and nothing anywhere substantiates
  // it: no list, no logos, no named employers. So the likely way it reaches the
  // record is a transcriber copying the source verbatim, which is why this
  // matches the bare number rather than the audit's "150+" shorthand. WTIA has
  // been asked for a source.
  it("does not republish the unsubstantiated 150-companies figure", () => {
    for (const {id, text} of SOURCES) expect(text, id).not.toMatch(/150/);
    for (const {locale, text} of messages) expect(text, locale).not.toMatch(/150/);
  });

  // WTIA issues CPAI alone; CUSCS separately issues its own completion
  // certificate to the same graduates. Calling it joint understates what WTIA
  // owns, and the record carries partnerCertificate* precisely so the real
  // arrangement can be stated instead.
  it("does not describe CPAI as jointly issued", () => {
    expect(source("cpai")).not.toMatch(/joint/i);
    for (const {locale, text} of messages) expect(text, locale).not.toMatch(/joint/i);
  });

  // The audit's "15+ experts from Huawei, Microsoft, HKPC" does have a source --
  // the May 2025 seminar post states it -- but three of WTIA's own pages give
  // three different speaker counts for that summit and none names a single
  // speaker. HKPC is the venue. An unverifiable roster does not go on the page.
  it("claims no speaker roster for the AI Leaders' Summit", () => {
    const tct = source("tct");
    // Never legitimate in a TCT value: no speaker from any of these appears
    // anywhere in the archive.
    for (const pattern of [/Huawei/i, /華為/, /Microsoft/i, /15\+/, /\d+\s*experts/i]) {
      expect(tct, String(pattern)).not.toMatch(pattern);
    }
    // HKPC is allowed as a venue and only as a venue. That is precisely the
    // claims review's correction -- the audit turned the building into an
    // employer -- so a guard banning the token outright would forbid the true
    // statement along with the false one.
    for (const match of tct.match(/HKPC[^']*/g) ?? []) {
      expect(match, match).toMatch(/^HKPC Building/);
    }
  });

  // A same-named predecessor with no series branding and no edition number.
  // The 2023 summit calls Tech to Connect 4.0 the "2nd edition", which makes
  // 2021-22 the first.
  it("does not present the 2019 TechConnect event as a TCT edition", () => {
    const tct = source("tct");
    // The literal token, not the year: "2019" also appears in prose about what
    // the archive does not contain, and banning it there would be theatre.
    expect(tct).not.toMatch(/labelEn: '[^']*2019/);
    expect(tct).not.toMatch(/year: 2019/);
  });

  // Every documented ASA edition from 2017 through 2022/23 names Create Hong
  // Kong. This catches the string form; program-content.test.ts catches the
  // structural form by checking each edition's yearStart against its agency.
  it("never names CCIDA against an ASA edition before 2024", () => {
    for (const line of source("asa").split("\n").filter((l) => /ccida/i.test(l))) {
      expect(line, line).not.toMatch(/201\d|202[0-3]/);
    }
  });

  // The audit read "16 regional co-organisers" off a page that says 16 regions
  // attended. Co-organiser counts are real for 2013 and 2016 and recorded as
  // such, so the guard is not "never say co-organiser" -- it is that the two
  // measurements never collapse into one field. asaProgramSchema's tagged union
  // enforces that; this pins that no free-text line reintroduces the conflation.
  it("does not describe an attendance figure as co-organisers", () => {
    for (const {id, text} of SOURCES) {
      expect(text, id).not.toMatch(/regional co-?organisers/i);
    }
    for (const {locale, text} of messages) {
      expect(text, locale).not.toMatch(/regional co-?organisers/i);
    }
  });

  // Proof the guard can still catch a violation. Without it, a refactor that
  // emptied SOURCES would let every assertion above pass vacuously.
  it("detects the shapes it is meant to catch", () => {
    expect(SOURCES).toHaveLength(4);
    for (const {id, text} of SOURCES) expect(text.length, id).toBeGreaterThan(200);

    // Comment stripping must not eat the values it is meant to protect. Every
    // record still carries its editions or its issuer after the strip, and the
    // off-site url survives with its scheme intact.
    for (const {id, text} of SOURCES) {
      expect(text, id).toMatch(/kind: '|issuerEn:/);
    }
    expect(source("asa")).toMatch(/https:\/\/contest2020\.bestasiaapp\.hk/);

    const hostile = [
      "recognized by over 150 pioneering companies",
      "a joint WTIA x CUSCS certification",
      "15+ experts from Huawei, Microsoft, HKPC",
      "16 regional co-organisers",
    ].join(" ");
    expect(hostile).toMatch(/150/);
    expect(hostile).toMatch(/joint/i);
    expect(hostile).toMatch(/Huawei/i);
    expect(hostile).toMatch(/regional co-?organisers/i);
  });
});
