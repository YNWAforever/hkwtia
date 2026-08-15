import {describe, expect, it} from "vitest";

import {
  type AsaEdition,
  asaProgramSchema,
  cpaiProgramSchema,
  hkictProgramSchema,
  type TctEdition,
  tctProgramSchema,
} from "@/content/schemas";

type AsaAgency = Extract<AsaEdition["funder"], {kind: "named"}>["agency"];
type TctAgency = Extract<TctEdition["funder"], {kind: "named"}>["agency"];

const listedWinners = {
  kind: "listed" as const,
  entries: [{nameEn: "RIFFAI", nameZh: "RIFFAI", categoryEn: "Living & Culture", categoryZh: "生活與文化"}],
};

const asa = {
  id: "asa" as const,
  editions: [{
    labelEn: "Asia Smart App Awards 2022/23",
    labelZh: "亞洲智能應用程式大獎 2022/23",
    yearStart: 2022,
    funder: {
      kind: "named" as const,
      agency: "createhk" as const,
      initiativeEn: "CreateSmart Initiative",
      initiativeZh: "創意智優計劃",
    },
    regions: {kind: "attended" as const, count: 16},
    winners: listedWinners,
    images: [],
  }],
};

const hkict = {
  id: "hkict" as const,
  editions: [{year: 2020, organisedFor: "ogcio" as const, winners: listedWinners, images: []}],
};

const tct = {
  id: "tct" as const,
  editions: [{
    labelEn: "Tech to Connect 4.0",
    labelZh: "智創互聯 4.0",
    year: 2023,
    shapeEn: "10 industry workshops, 2 seminars and a grand conference",
    shapeZh: "十場業界工作坊、兩場研討會及一場大型會議",
    funder: {kind: "named" as const, agency: "gsp" as const, initiativeEn: "GSP", initiativeZh: "GSP"},
    images: [],
  }],
};

const cpai = {
  id: "cpai" as const,
  issuerEn: "WTIA",
  issuerZh: "香港無線科技商會",
  coursePartnerEn: "CUHK School of Continuing and Professional Studies",
  coursePartnerZh: "香港中文大學專業進修學院",
  courseNameEn: "Generative AI for Business Innovation and Applications",
  courseNameZh: "生成式人工智能商業應用課程",
  partnerCertificateEn: "CUSCS certificate of completion",
  partnerCertificateZh: "CUSCS 結業證書",
  syllabus: [{titleEn: "Foundations", titleZh: "基礎"}],
  images: [],
};

describe("programme schemas", () => {
  it("accept a complete record of each shape", () => {
    expect(asaProgramSchema.parse(asa).editions).toHaveLength(1);
    expect(hkictProgramSchema.parse(hkict).editions).toHaveLength(1);
    expect(tctProgramSchema.parse(tct).editions).toHaveLength(1);
    expect(cpaiProgramSchema.parse(cpai).issuerEn).toBe("WTIA");
  });

  // The structural fix for the CCIDA error. CreateHK funded 2017 through
  // 2022/23; CCIDA appears only from 2024. There must be no field in which
  // "the funder of ASA" can be written at all, so the mistake is
  // unrepresentable rather than merely discouraged.
  it("gives ASA no programme-level funder to write", () => {
    expect(() => asaProgramSchema.parse({
      ...asa,
      funder: {kind: "named", agency: "ccida", initiativeEn: "x", initiativeZh: "x"},
    })).toThrow();
  });

  // Same shape, same reason: OGCIO for 2020-2024, DPO from 2025.
  it("gives HKICT no programme-level counterparty to write", () => {
    expect(() => hkictProgramSchema.parse({...hkict, organisedFor: "dpo"})).toThrow();
  });

  it("requires a funder decision on every ASA edition", () => {
    const [edition] = asa.editions;
    const withoutFunder: Record<string, unknown> = {...edition};
    delete withoutFunder.funder;
    expect(() => asaProgramSchema.parse({...asa, editions: [withoutFunder]})).toThrow();
  });

  it("rejects a funding agency outside each programme's documented set", () => {
    // CCIDA never funded TCT; GSP never funded ASA. Sharing one agency enum
    // across programmes would let either through.
    expect(() => tctProgramSchema.parse({
      ...tct,
      editions: [{...tct.editions[0], funder: {...tct.editions[0].funder, agency: "ccida"}}],
    })).toThrow();
    expect(() => asaProgramSchema.parse({
      ...asa,
      editions: [{...asa.editions[0], funder: {...asa.editions[0].funder, agency: "gsp"}}],
    })).toThrow();
  });

  // The same rule at the type level. `fundingSchema` is generic, and a generic
  // that widens its argument to `readonly string[]` leaves every `.parse` test
  // above still passing while `agency` silently becomes plain `string` -- so the
  // compiler stops rejecting the mistake and only the runtime does. Both
  // directives below must stay necessary; `npm run typecheck` fails if either
  // stops reporting an error.
  it("keeps each programme's agency set a distinct type, not just a distinct parse", () => {
    const asaAgencies: AsaAgency[] = ["createhk", "ccida"];
    const tctAgencies: TctAgency[] = ["gsp"];
    // @ts-expect-error GSP never funded ASA.
    const gspOnAsa: AsaAgency = "gsp";
    // @ts-expect-error CCIDA never funded TCT.
    const ccidaOnTct: TctAgency = "ccida";
    expect([...asaAgencies, ...tctAgencies]).toHaveLength(3);
    expect([gspOnAsa, ccidaOnTct]).toHaveLength(2);
  });

  // An empty winners array is indistinguishable from an editor who has not
  // filled it in. The archive genuinely does not record ASA 2020-2021 or HKICT
  // 2021/2022/2024 winners, so absence has to be stated, not inferred.
  it("requires absence to be stated rather than left empty", () => {
    expect(() => hkictProgramSchema.parse({
      ...hkict, editions: [{...hkict.editions[0], winners: {kind: "listed", entries: []}}],
    })).toThrow();

    for (const winners of [{kind: "unrecorded"}, {kind: "off-site", url: "https://contest2020.bestasiaapp.hk/"}]) {
      expect(() => hkictProgramSchema.parse({
        ...hkict, editions: [{...hkict.editions[0], winners}],
      }), JSON.stringify(winners)).not.toThrow();
    }
  });

  // The two tests above probe the programme level. This one probes the
  // edition, which is where contradicted claim #2 would actually be written:
  // `coOrganisers: 16` alongside a regions count is precisely the conflation
  // the schema exists to stop, and without .strict() on the edition object it
  // would be dropped in silence and the editor would believe it shipped.
  it("rejects an unknown key on an edition, not just on the programme", () => {
    expect(() => asaProgramSchema.parse({
      ...asa, editions: [{...asa.editions[0], coOrganisers: 16}],
    })).toThrow();
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], workshops: 10}],
    })).toThrow();
  });

  // Same rule one level deeper. The archive never says what a winner built, so
  // `descriptionEn` must be refused loudly; silently dropping it would let an
  // editor believe they had published something that never renders.
  it("rejects an unknown key on a winner and on an image", () => {
    expect(() => asaProgramSchema.parse({
      ...asa,
      editions: [{...asa.editions[0], winners: {
        kind: "listed", entries: [{...listedWinners.entries[0], descriptionEn: "an AI music app"}],
      }}],
    })).toThrow();
    expect(() => cpaiProgramSchema.parse({
      ...cpai, images: [{src: "/images/programs/a.jpg", altEn: "a", altZh: "a", caption: "x"}],
    })).toThrow();
  });

  // Both eras of the regions claim are representable, and so is the 2025 case
  // where the home page says 17 and its own carousel renders 15.
  it("keeps attended and co-organiser region counts distinct", () => {
    for (const regions of [
      {kind: "attended", count: 11},
      {kind: "co-organisers", count: 7},
      {kind: "unrecorded"},
    ]) {
      expect(() => asaProgramSchema.parse({
        ...asa, editions: [{...asa.editions[0], regions}],
      }), JSON.stringify(regions)).not.toThrow();
    }
    // A bare number is the flattened field the audit's error came from.
    expect(() => asaProgramSchema.parse({
      ...asa, editions: [{...asa.editions[0], regions: 16}],
    })).toThrow();
  });

  // Most TCT editions will use this branch -- GSP is named once in 577 pages --
  // so a typo in the literal must fail here rather than at import time in a
  // later task.
  it("accepts an edition whose funder the archive does not name", () => {
    expect(tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], funder: {kind: "none-recorded"}}],
    }).editions[0].funder.kind).toBe("none-recorded");
    expect(asaProgramSchema.parse({
      ...asa, editions: [{...asa.editions[0], funder: {kind: "none-recorded"}}],
    }).editions[0].funder.kind).toBe("none-recorded");
  });

  // Each floor encodes a claims-review correction: ASA starts 2013, the ICT
  // Startup Award stream starts 2020 (the 2006 Best Ubiquitous Award is a
  // different stream), and TCT starts 2021 (2019 is a same-named predecessor).
  it("rejects a year below each programme's documented first edition", () => {
    expect(() => asaProgramSchema.parse({
      ...asa, editions: [{...asa.editions[0], yearStart: 2012}],
    })).toThrow();
    expect(() => hkictProgramSchema.parse({
      ...hkict, editions: [{...hkict.editions[0], year: 2019}],
    })).toThrow();
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], year: 2020}],
    })).toThrow();
  });

  it("requires an off-site winner list to say where, over https", () => {
    expect(() => hkictProgramSchema.parse({
      ...hkict, editions: [{...hkict.editions[0], winners: {kind: "off-site"}}],
    })).toThrow();
    // The first three `z.string().url()` accepts; the last two the scheme
    // regex accepts. Neither check alone is enough, so both are chained.
    for (const url of [
      "mailto:info@hkwtia.org",
      "javascript:alert(1)",
      "http://contest2020.bestasiaapp.hk/",
      "https://",
      "https://a b c",
    ]) {
      expect(() => hkictProgramSchema.parse({
        ...hkict, editions: [{...hkict.editions[0], winners: {kind: "off-site", url}}],
      }), url).toThrow();
    }
  });

  // CPAI is a credential, not an event series. Giving it editions would invite
  // exactly the "when did CPAI run" framing the archive cannot support.
  it("gives CPAI no editions", () => {
    expect(() => cpaiProgramSchema.parse({...cpai, editions: []})).toThrow();
  });

  // The CSP is `img-src 'self' data:` with no remotePatterns, so a remote src
  // renders nothing in the browser.
  it("rejects an image that is not own-origin under /images/programs/", () => {
    for (const src of ["https://hkwtia.org/a.jpg", "/images/history/a.jpg", "images/programs/a.jpg"]) {
      expect(() => cpaiProgramSchema.parse({
        ...cpai, images: [{src, altEn: "a", altZh: "a"}],
      }), src).toThrow();
    }
  });

  it("requires both locales everywhere one is required", () => {
    expect(() => cpaiProgramSchema.parse({...cpai, issuerZh: ""})).toThrow();
    expect(() => cpaiProgramSchema.parse({...cpai, courseNameZh: ""})).toThrow();
    expect(() => cpaiProgramSchema.parse({...cpai, partnerCertificateZh: ""})).toThrow();
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], shapeZh: ""}],
    })).toThrow();
    // An edition's name is a heading. A single `label` would put "Tech to
    // Connect 4.0" at the top of an otherwise-Chinese page.
    expect(() => asaProgramSchema.parse({
      ...asa, editions: [{...asa.editions[0], labelZh: ""}],
    })).toThrow();
    expect(() => tctProgramSchema.parse({
      ...tct, editions: [{...tct.editions[0], labelZh: ""}],
    })).toThrow();
  });
});
