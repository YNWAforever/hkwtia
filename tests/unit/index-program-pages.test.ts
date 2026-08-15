import {describe, expect, it} from "vitest";

import programPages from "@/content/program-pages.json";
import {ALLOWLIST, classifyPage, conflictingAllowlistEntries, EXCLUSIONS, type ProgramId} from "@/scripts/index-program-pages";

describe("program page classification", () => {
  it("assigns the obvious pages to their programme", () => {
    expect(classifyPage("hkwtia-org-event-asia-smart-app-summit-2024.html")).toBe("asa");
    expect(classifyPage("hkwtia-org-2020-01-2020-hong-kong-ict-awards-ict-startup-award.html")).toBe("hkict");
    expect(classifyPage("hkwtia-org-event-tech-to-connect-4-0-leaders-summit-transforming-smart-lead-through-industry-4-0.html")).toBe("tct");
    expect(classifyPage(
      "hkwtia-org-event-graduation-ceremony-for-the-certified-practitioner-in-generative-ai-for-business-innovation-and-applications-cpai-program.html",
    )).toBe("cpai");
  });

  // The 2019 TechConnect Conference & Festival carries no "Tech to Connect"
  // branding, no edition number and no link to the series site. The 2023 summit
  // calls Tech to Connect 4.0 the "2nd edition", which makes 2021-22 the first.
  // 2019 is a same-named predecessor, not edition zero. This must keep holding
  // now that hyphenated "tech-connect" (no "to") is also a valid TCT
  // inclusion: the fused word "techconnect" these two filenames use never
  // contains the contiguous substring "tech-connect", so the exclusion and
  // the newer inclusion pattern cannot collide.
  it("excludes the 2019 TechConnect predecessor from TCT", () => {
    expect(classifyPage("hkwtia-org-2019-01-2019-techconnect-conference-festival.html")).toBeNull();
    expect(classifyPage("hkwtia-org-event-5g-iot-techconnect-conference.html")).toBeNull();
  });

  // The Best Ubiquitous Award (2006), renamed Best Mobile Apps Award in 2013,
  // is a different award stream from the ICT Startup Award, which begins with
  // the 2020 edition. Whether that lineage should appear at all is an open
  // question for WTIA, so it stays off the page until they answer.
  it("excludes the Best Mobile Apps lineage from HKICT", () => {
    for (const file of [
      "hkwtia-org-2006-01-2006-hong-kong-ict-awards-best-ubiquitous-award.html",
      "hkwtia-org-2015-01-2015-hong-kong-ict-awards-2015-best-mobile-apps-award.html",
      "hkwtia-org-2017-01-2017-hong-kong-ict-awards-best-mobile-app-award.html",
    ]) {
      expect(classifyPage(file), file).toBeNull();
    }
  });

  // GenAI appears in several WTIA event titles that have nothing to do with the
  // CPAI credential -- an AWS pop-up, a Google Cloud tour, a startups panel.
  // Matching on "genai" alone would pull all three into CPAI's image set.
  it("does not treat every GenAI event as CPAI", () => {
    for (const file of [
      "hkwtia-org-event-e3-80-90wtia-e5-b0-8e-e8-b3-9e-e5-9c-98-e3-80-91wtia-x-aws-genai-pop-up-e9-ab-94-e9-a9-97-e7-a9-ba-e9-96-93.html",
      "hkwtia-org-event-wtia-go-for-it-business-tour-google-cloud-genai-popup-experience-tour.html",
      "hkwtia-org-event-smart-innovation-meets-genai-trends-shaping-the-next-decade-of-startups.html",
    ]) {
      expect(classifyPage(file), file).toBeNull();
    }
  });

  it("returns null for a page belonging to no programme", () => {
    expect(classifyPage("hkwtia-org-2001-01-2001-establishment-of-wtia.html")).toBeNull();
  });

  // Found during the Step 7 hand review: two HKICT pages carry
  // "ICT Startup Award" only in Chinese (資訊科技初創企業獎) in their slug -- the
  // page's own <title> is bilingual, but "ict-startup-award" alone missed both.
  it("catches HKICT pages whose slug is Chinese-only", () => {
    expect(classifyPage(
      "hkwtia-org-2025-10-2025-e9-a6-99-e6-b8-af-e8-b3-87-e8-a8-8a-e5-8f-8a-e9-80-9a-e8-a8-8a-e7-a7-91-e6-8a-80-e7-8d-8e-ef-bc-9a-e8-b3-87-e8-a8-8a-e7-a7-91-e6-8a-80-e5-88-9d-e5-89-b5-e4-bc-81-e6-a5-ad-e7-8d-8e.html",
    )).toBe("hkict");
    expect(classifyPage(
      "hkwtia-org-event-e3-80-8c2024-e8-b3-87-e8-a8-8a-e7-a7-91-e6-8a-80-e5-88-9d-e5-89-b5-e4-bc-81-e6-a5-ad-e7-8d-8e-e3-80-8d-e6-8b-9b-e5-8b-9f-e6-97-a5.html",
    )).toBe("hkict");
  });

  // Found during the Step 7 hand review: WTIA renamed the series from
  // "Tech to Connect" to "Tech Connect" (智創互聯) partway through 2024-25.
  // These three pages carry the new name -- with no "to" -- so
  // "tech-to-connect" alone missed all three.
  it("catches TCT pages using the renamed 'Tech Connect' branding", () => {
    expect(classifyPage(
      "hkwtia-org-2025-05-e3-80-8ctech-connect-e6-99-ba-e5-89-b5-e4-ba-92-e8-81-af-e3-80-8dai-e9-a0-98-e8-a2-96-e7-b3-bb-e5-88-97-e7-a0-94-e8-a8-8e-e6-9c-83-tech-connect-ai-leaders-seminar-series.html",
    )).toBe("tct");
    expect(classifyPage(
      "hkwtia-org-event-e3-80-90tech-connect-e7-b3-bb-e5-88-97-e5-b7-a5-e4-bd-9c-e5-9d-8a3-e3-80-91ai-e4-ba-92-e5-8b-95-e5-89-b5-e6-96-b0-e8-80-85-e4-bb-a5-e6-99-ba-e8-83-bd-e6-ba-9d-e9-80-9a-e6-90-ad-e5-bb-ba-e6-a9-8b.html",
    )).toBe("tct");
    expect(classifyPage(
      "hkwtia-org-event-e3-80-90tech-connect-e7-b3-bb-e5-88-97-e5-b7-a5-e4-bd-9c-e5-9d-8a9-e3-80-91ai-e9-9b-bb-e5-95-86-e7-ad-96-e5-b1-95-ef-bc-9a-e5-80-8b-e6-80-a7-e5-8c-96-e6-8e-a8-e8-96-a6-e7-9a-84-e8-97-9d-e8-a1-93.html",
    )).toBe("tct");
  });

  // Found by a title sweep (not filename search): CPAI's canonical landing
  // page carries the issuer/course/credential prose a later task needs to
  // transcribe, but its slug ("certified-courses") is too generic to trust
  // as a pattern (no programme-specific word in it), so it lives in the
  // ALLOWLIST rather than as a fifth CPAI regex alternative.
  it("catches the CPAI landing page via the allowlist", () => {
    expect(classifyPage("hkwtia-org-certified-courses.html")).toBe("cpai");
  });

  // Found by the same title sweep: the 2023 ICT Startup Award ceremony (with
  // the full 2023 winner list) and the 2023 startup seminar both abbreviate
  // to "ICTA" in their own titles, which neither "ict-startup-award" nor
  // "ict-awards" matches.
  it("catches the 2023 ICTA-abbreviated HKICT pages", () => {
    expect(classifyPage("hkwtia-org-event-icta23-awards-presentation-ceremony-cum-dinner.html")).toBe("hkict");
    expect(classifyPage(
      "hkwtia-org-event-icta-2023-startup-seminar-from-zero-to-one-launching-your-entrepreneurial-journey.html",
    )).toBe("hkict");
  });

  // Found by the same title sweep: WTIA's programme lineage is Asia
  // Smartphone Apps Contest (2013) -> Asia Smart App Awards -> Asia Smart
  // Innovation Awards, all the same programme under different names.
  // docs/wtia-programme-claims-review.md sources ASA's co-organiser counts
  // from exactly the 2013 and 2016 pages here, and the ASA schema's
  // yearStart minimum is 2013 -- both only make sense if this is ASA.
  it("catches the 'Asia Smartphone' era of ASA's name", () => {
    for (const file of [
      "hkwtia-org-2013-01-2013-asia-smartphone-contest.html",
      "hkwtia-org-2015-01-2015-asia-smartphone-apps-contest-summit-2015.html",
      "hkwtia-org-2016-01-2016-asia-smartphone-apps-summit-cum-award-presentation-ceremony-2016.html",
    ]) {
      expect(classifyPage(file), file).toBe("asa");
    }
  });

  // hkwtia-org-event-7729.html's original title used a fullwidth colon
  // ("Asia Smart App Workshop - UIUX： Mobile first"), which the capture
  // tool's slugifier dropped along with everything after it, collapsing the
  // slug to the bare WordPress post ID. No filename pattern can reach this;
  // it requires the ALLOWLIST escape hatch.
  it("catches the bare-post-ID page via the allowlist", () => {
    expect(classifyPage("hkwtia-org-event-7729.html")).toBe("asa");
  });

  // Other bare-post-ID pages in the archive are not programme pages, so the
  // allowlist must stay a targeted exception, not a rule that swallows every
  // digits-only slug.
  it("does not classify other bare-post-ID pages that are not programme pages", () => {
    expect(classifyPage("hkwtia-org-event-4984.html")).toBeNull();
    expect(classifyPage("hkwtia-org-event-5291.html")).toBeNull();
  });

  // ALLOWLIST is a Map, which has no prototype-chain surface: Map.get("toString")
  // is undefined for any key not explicitly set, unlike a plain object's `in`/
  // bracket access, which would have returned Object.prototype.toString itself
  // -- violating the declared `ProgramId | null` return type in a way
  // TypeScript cannot catch (tsconfig.json does not set
  // noUncheckedIndexedAccess). Kept as a regression guard even though the Map
  // choice makes this structurally impossible now, not just fixed.
  it("does not walk the prototype chain when looking up the allowlist", () => {
    for (const key of ["toString", "constructor", "valueOf", "hasOwnProperty"]) {
      expect(classifyPage(key), key).toBeNull();
    }
  });

  // No real archive filename matches two inclusion patterns today (verified
  // against all 577 captured pages), so this filename is synthetic rather
  // than lifted from the archive like the rest of the suite -- there is no
  // real one to borrow. It exists to pin the throw itself: first-match-wins
  // would otherwise let a later widening of one pattern silently move a page
  // from one programme to another.
  it("throws if a filename matches more than one programme's inclusion pattern", () => {
    expect(() => classifyPage("hkwtia-org-event-asia-smart-app-x-hong-kong-ict-awards-crossover.html")).toThrow(
      /matches more than one programme/,
    );
  });
});

describe("conflictingAllowlistEntries", () => {
  // Synthetic, not archive-lifted: no real ALLOWLIST entry conflicts with a
  // real EXCLUSIONS pattern today (the next test asserts that), so there is
  // no real example to borrow. This pins the detection itself -- a
  // deliberately allowlisted page whose filename an exclusion pattern also
  // matches is a genuine contradiction between two rule sets, and main()
  // must refuse to resolve it silently rather than pick a winner.
  it("flags a filename present in both the allowlist and an exclusion pattern", () => {
    const allowlist = new Map<string, ProgramId>([
      ["hkwtia-org-event-some-techconnect-page.html", "tct"],
      ["hkwtia-org-certified-courses.html", "cpai"],
    ]);
    const exclusions = [/techconnect/];
    expect(conflictingAllowlistEntries(allowlist, exclusions)).toEqual([
      "hkwtia-org-event-some-techconnect-page.html",
    ]);
  });

  it("returns an empty array when nothing conflicts", () => {
    expect(conflictingAllowlistEntries(new Map([["a.html", "asa"]]), [/never-matches/])).toEqual([]);
  });

  // The real pair this repository ships: today's two ALLOWLIST entries
  // (hkwtia-org-event-7729.html, hkwtia-org-certified-courses.html) against
  // today's three EXCLUSIONS patterns (techconnect, best-mobile-app family,
  // GenAI events). main() calls this exact pairing before writing the index.
  it("finds no conflicts in the real ALLOWLIST/EXCLUSIONS pair", () => {
    expect(conflictingAllowlistEntries(ALLOWLIST, EXCLUSIONS)).toEqual([]);
  });
});

describe("content/program-pages.json stays in sync with the classifier", () => {
  // Without this, widening a pattern (e.g. hkict to the singular
  // "/ict-award/") would change what gets written by the generator script
  // but fail no test, because every other test in this file asserts against
  // specific filenames that would not themselves change verdict. This
  // catches both a forgotten regeneration after a pattern change and a
  // hand-edit of the JSON (which docs/superpowers/plans/2026-08-12-programme-
  // records.md forbids).
  it("classifies every indexed filename the same way the classifier does today", () => {
    for (const [programme, filenames] of Object.entries(programPages)) {
      for (const filename of filenames) {
        expect(classifyPage(filename), `${programme}/${filename}`).toBe(programme);
      }
    }
  });

  // Named constants, not a `.length` read off the live JSON, so a count
  // that moves because a pattern widened has to be a conscious edit to this
  // file -- mirrors EXPECTED_UNIQUE_IMAGES in
  // scripts/download-milestone-images.ts. Reviewed in Step 7 of the plan.
  const EXPECTED_ASA_COUNT = 34;
  const EXPECTED_HKICT_COUNT = 15;
  const EXPECTED_CPAI_COUNT = 3;
  const EXPECTED_TCT_COUNT = 36;

  it("has the reviewed per-programme counts", () => {
    expect(programPages.asa).toHaveLength(EXPECTED_ASA_COUNT);
    expect(programPages.hkict).toHaveLength(EXPECTED_HKICT_COUNT);
    expect(programPages.cpai).toHaveLength(EXPECTED_CPAI_COUNT);
    expect(programPages.tct).toHaveLength(EXPECTED_TCT_COUNT);
  });
});
