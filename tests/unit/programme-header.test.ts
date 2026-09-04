import {describe, expect, it} from "vitest";

import {summarizeProgrammes} from "@/lib/home/programme-summaries";
import {buildProgrammeHeaderFacts} from "@/lib/programs/programme-header";

function fakeT(key: string, values?: Record<string, string | number>) {
  const templates: Record<string, string> = {
    eventSeriesLabel: "Event series",
    credentialLabel: "Credential",
    editionsFact: "{count} editions since {year}",
    credentialFact: "Issued directly by WTIA",
    mailSubject: "{programme} programme enquiry",
  };
  return Object.entries(values ?? {}).reduce((text, [name, value]) => text.replace(`{${name}}`, String(value)), templates[key]!);
}

describe("buildProgrammeHeaderFacts", () => {
  it("states an event series's real edition count and latest year, reused from summarizeProgrammes", () => {
    const asa = summarizeProgrammes().find((programme) => programme.id === "asa")!;
    const facts = buildProgrammeHeaderFacts(asa, fakeT, "Asia Smart App Awards");

    expect(facts.typeLabel).toBe("Event series");
    expect(facts.fact).toBe(`${asa.editionCount} editions since ${asa.latestYear}`);
    expect(facts.mailSubject).toBe("Asia Smart App Awards programme enquiry");
  });

  it("states cpai as a credential with no edition count", () => {
    const cpai = summarizeProgrammes().find((programme) => programme.id === "cpai")!;
    const facts = buildProgrammeHeaderFacts(cpai, fakeT, "CPAI");

    expect(facts.typeLabel).toBe("Credential");
    expect(facts.fact).toBe("Issued directly by WTIA");
    expect(facts.mailSubject).toBe("CPAI programme enquiry");
  });
});
