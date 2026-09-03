import {describe, expect, it} from "vitest";

import {asa} from "@/content/programs/asa";
import {hkict} from "@/content/programs/hkict";
import {tct} from "@/content/programs/tct";

describe("summarizeProgrammes", () => {
  it("marks cpai a credential with no edition count or year, and the others event series", async () => {
    const {summarizeProgrammes} = await import("@/lib/home/programme-summaries");
    const summaries = summarizeProgrammes();

    expect(summaries.map((programme) => programme.id)).toEqual(["cpai", "hkict", "tct", "asa"]);
    const cpai = summaries.find((programme) => programme.id === "cpai")!;
    expect(cpai.type).toBe("credential");
    expect(cpai.editionCount).toBeNull();
    expect(cpai.latestYear).toBeNull();

    const hkictSummary = summaries.find((programme) => programme.id === "hkict")!;
    expect(hkictSummary.type).toBe("event-series");
    expect(hkictSummary.editionCount).toBe(hkict.editions.length);
    expect(hkictSummary.latestYear).toBe(Math.max(...hkict.editions.map((edition) => edition.year)));

    const tctSummary = summaries.find((programme) => programme.id === "tct")!;
    expect(tctSummary.editionCount).toBe(tct.editions.length);
    expect(tctSummary.latestYear).toBe(Math.max(...tct.editions.map((edition) => edition.year)));

    const asaSummary = summaries.find((programme) => programme.id === "asa")!;
    expect(asaSummary.editionCount).toBe(asa.editions.length);
    expect(asaSummary.latestYear).toBe(Math.max(...asa.editions.map((edition) => edition.yearStart)));
  });
});
