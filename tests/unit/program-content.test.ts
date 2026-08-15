import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";

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
  // means someone transcribed names from photo captions.
  it("defers the 2020 and 2021 winners off-site", () => {
    for (const yearStart of [2020, 2021]) {
      const edition = asa.editions.find((item) => item.yearStart === yearStart);
      if (!edition) continue;
      expect(edition.winners.kind, `${yearStart}`).toBe("off-site");
    }
  });

  // The era boundary, which nothing else pins. The archive counts co-organising
  // regions while the contest is the Asia Smartphone (Apps) Contest -- "7 Asia
  // Regions ... was the co-organizer" in 2013 and 2015, 9 in 2016 -- and
  // switches to counting participation once it becomes the Asia Smart App
  // Awards in 2017: "11 participating countries/ regions", 13, 15, then 16
  // "industry experts from ... Asian regions" in 2024. The audit flattened the
  // two, reading a participation figure as a co-organiser count; a record that
  // put `co-organisers` on a 2017-or-later edition would be making the same
  // mistake in the file itself. `unrecorded` is allowed in either era.
  it("counts co-organising regions only before the 2017 rename, and attendance only after", () => {
    for (const edition of asa.editions) {
      if (edition.regions.kind === "co-organisers") {
        expect(edition.yearStart, edition.labelEn).toBeLessThan(2017);
      }
      if (edition.regions.kind === "attended") {
        expect(edition.yearStart, edition.labelEn).toBeGreaterThanOrEqual(2017);
      }
    }
  });
});
