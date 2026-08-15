import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";
import {cpai} from "@/content/programs/cpai";
import {hkict} from "@/content/programs/hkict";
import {tct} from "@/content/programs/tct";

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

describe("CPAI record", () => {
  // The correction docs/wtia-programme-claims-review.md §2 asks for. The audit
  // calls CPAI a "joint WTIA × CUSCS certification"; the course page is
  // explicit that WTIA issues it alone — 「CPAI … 由 WTIA 頒發」 — and that CUSCS
  // separately issues its own 結業證書 to the same graduates. cpaiProgramSchema
  // has no field a joint issuer could be written into; this pins that the two
  // fields it does have are not quietly filled with the same body.
  it("names WTIA as the issuer and CUSCS only as the course partner", () => {
    expect(cpai.issuerEn).toBe("WTIA");
    expect(cpai.coursePartnerEn).not.toBe(cpai.issuerEn);
  });

  // The other half of 「一個課程，兩張認證。」 Refusing to represent a joint issuer
  // states only half the arrangement: without CUSCS's own completion
  // certificate named separately from the credential, a reader learns only that
  // CUSCS teaches the course.
  it("names CUSCS's completion certificate as distinct from CPAI itself", () => {
    expect(cpai.partnerCertificateZh).toBe("CUSCS 結業證書");
    expect(cpai.partnerCertificateEn).not.toBe(cpai.courseNameEn);
  });

  // The syllabus is the one part of this record with drafted English in every
  // entry, so the Chinese is what anchors it. The course page says 「12 小時實戰
  // 課程，涵蓋四大模組：」 and then names exactly these four, in this order. A
  // fifth module, a dropped one, or a reworded one means someone wrote a
  // syllabus rather than transcribed one — which is the failure this file's
  // English titles are already closest to.
  it("carries the course page's four modules verbatim, in its order", () => {
    expect(cpai.syllabus.map(({titleZh}) => titleZh)).toEqual([
      "企業 AI 應用的策略框架",
      "生成式 AI 內容創作實操",
      "AI 時代的網絡安全與合規要點",
      "垂直行業 AI 應用案例",
    ]);
  });
});

describe("TCT record", () => {
  it("has editions and starts no earlier than 2021", () => {
    expect(tct.editions.length).toBeGreaterThan(0);
    expect(Math.min(...tct.editions.map(({year}) => year))).toBeGreaterThanOrEqual(2021);
  });

  // GSP is named exactly once in 577 pages, on the July 2023 seminar page.
  it("names GSP for the 2023 edition only", () => {
    for (const edition of tct.editions) {
      if (edition.funder.kind === "named") expect(edition.year).toBe(2023);
    }
  });

  // The audit's actual error, in the form it took: one edition's structure
  // written as the programme's. The 26 August 2021 kick-off page states its own
  // edition as "two Public Awareness Seminars, a TechConnect Conference and a
  // total of 12 Technical workshops"; the 25 July 2023 seminar page says the
  // 4.0 campaign "has already held 10 workshops". Both counts are real and they
  // belong to different editions, so a shared shape string — or a twelve
  // against 2023, or a ten against 2021 — is the mistake reappearing inside the
  // record. `shapeEn`/`shapeZh` are free text for exactly this reason.
  it("gives every edition its own shape, and does not swap 2021's twelve for 2023's ten", () => {
    const shapes = tct.editions.map(({shapeEn}) => shapeEn);
    expect(new Set(shapes).size, "two editions share a shape string").toBe(shapes.length);

    const shapeFor = (year: number) => tct.editions.find((edition) => edition.year === year)?.shapeEn;
    expect(shapeFor(2021)).toMatch(/\btwelve\b/i);
    expect(shapeFor(2021)).not.toMatch(/\bten\b/i);
    expect(shapeFor(2023)).toMatch(/\bten\b/i);
    expect(shapeFor(2023)).not.toMatch(/\btwelve\b/i);
  });
});
