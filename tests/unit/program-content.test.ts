import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";
import {hkict} from "@/content/programs/hkict";

describe("ASA record", () => {
  // The parse in content/programs/asa.ts already throws on a malformed record;
  // this asserts the file is actually reachable and non-empty, so a future
  // refactor that stubs it out fails here rather than silently rendering
  // nothing.
  it("has editions", () => {
    expect(asa.editions.length).toBeGreaterThan(0);
  });

  // The correction this sub-project exists for. CCIDA appears only from 2024;
  // naming it against an earlier edition misattributes government funding.
  it("names no funder before its documented era", () => {
    for (const edition of asa.editions) {
      if (edition.funder.kind !== "named") continue;
      if (edition.funder.agency === "ccida") expect(edition.yearStart).toBeGreaterThanOrEqual(2024);
      if (edition.funder.agency === "createhk") expect(edition.yearStart).toBeLessThan(2024);
    }
  });

  // Neither microsite was captured, so a listed winner set for either year
  // means someone transcribed names from photo captions, or from the two
  // kick-off pages that name a handful of returning winners as panellists.
  //
  // The two years are asserted differently because the archive treats them
  // differently. 2020's ceremony page states outright "Full list of Award
  // Winners will be uploaded: https://contest2020.bestasiaapp.hk/", quoting a
  // bare url. 2021's carries only a `Website:` field pointing at that
  // ceremony's own sub-page, and never says the winners were published there --
  // so `off-site` for 2021 would have to link to a url no page writes.
  it("publishes no winner list for 2020 or 2021", () => {
    const yearStart = (year: number) => asa.editions.find((item) => item.yearStart === year);

    expect(yearStart(2020)?.winners).toEqual({
      kind: "off-site",
      url: "https://contest2020.bestasiaapp.hk/",
    });
    expect(yearStart(2021)?.winners.kind).toBe("unrecorded");
  });

  // The era boundary, which nothing else pins. Through 2016 the archive counts
  // co-organising regions -- "7 Asia Regions ... was the co-organizer", 9 in
  // 2016 -- and from the 2017 rename to Asia Smart App Awards it counts
  // participation instead: "11 participating countries/ regions", 13, 15, then
  // 16 "industry experts from ... Asian regions" in 2024. The audit flattened
  // the two, reading a participation figure as a co-organiser count; a record
  // that put `co-organisers` on a 2017-2024 edition would be making the same
  // mistake in the file itself.
  //
  // Bounded at 2024 on purpose. The 2025 home page reverts to the earlier
  // wording -- "Uniting 17 regional co-organisers" -- so the era is not open
  // ended. That edition is `unrecorded` today only because the same page's
  // carousel renders 15 logos; should WTIA settle it at 17, the accurate
  // transcription is a `co-organisers` figure, and this test must not block it.
  // `unrecorded` is allowed anywhere.
  const ATTENDANCE_ERA_END = 2024;

  it("counts co-organising regions only before the 2017 rename, and attendance only after", () => {
    for (const edition of asa.editions) {
      if (edition.yearStart > ATTENDANCE_ERA_END) continue;
      if (edition.regions.kind === "co-organisers") {
        expect(edition.yearStart, edition.labelEn).toBeLessThan(2017);
      }
      if (edition.regions.kind === "attended") {
        expect(edition.yearStart, edition.labelEn).toBeGreaterThanOrEqual(2017);
      }
    }
  });
});

describe("HKICT record", () => {
  it("has editions", () => {
    expect(hkict.editions.length).toBeGreaterThan(0);
  });

  // DPO applies only from 2025. Naming it for an earlier edition attributes the
  // award to a body that did not exist under that name at the time.
  it("names the counterparty each edition's own era used", () => {
    for (const edition of hkict.editions) {
      if (edition.organisedFor === "dpo") expect(edition.year).toBeGreaterThanOrEqual(2025);
      if (edition.organisedFor === "ogcio") expect(edition.year).toBeLessThan(2025);
    }
  });

  // The Startup Award stream begins in 2020; anything earlier is the Best
  // Mobile Apps lineage, which is a different award.
  it("starts at the 2020 edition", () => {
    expect(Math.min(...hkict.editions.map(({year}) => year))).toBeGreaterThanOrEqual(2020);
  });

  // 2023 is the only edition whose winners the archive publishes as a list, and
  // the list has one feature nothing else in this repo protects: its 社會貢獻
  // category awards Gold, Silver, Silver and a certificate of merit, where the
  // other two categories run Gold/Silver/Bronze. It reads like a typo for 銅獎
  // and it is not one this record may fix — the ICTA23 ceremony page says 銀獎
  // twice, and correcting it here would publish an award tier WTIA never
  // announced. The count is pinned alongside it because the page's list ends
  // mid-thought at "優異證書 – Liquid Tech", so a fourteenth entry would mean
  // someone completed the page rather than transcribed it.
  it("keeps the 2023 list's duplicated Silver award rather than tidying it", () => {
    const winners = hkict.editions.find(({year}) => year === 2023)?.winners;
    if (winners?.kind !== "listed") throw new Error("EXPECTED_LISTED_2023_WINNERS");

    expect(winners.entries).toHaveLength(13);
    expect(
      winners.entries
        .filter(({categoryZh}) => categoryZh.startsWith("資訊科技初創企業（社會貢獻）獎"))
        .map(({categoryZh}) => categoryZh),
    ).toEqual([
      "資訊科技初創企業（社會貢獻）獎 — 金獎",
      "資訊科技初創企業（社會貢獻）獎 — 銀獎",
      "資訊科技初創企業（社會貢獻）獎 — 銀獎",
      "資訊科技初創企業（社會貢獻）獎 — 優異證書",
    ]);
  });
});
