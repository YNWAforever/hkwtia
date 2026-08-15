import {z} from 'zod';

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const eventSchema = z.object({
  slug,
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  venue: z.string().min(1),
  image: z.string().startsWith('/'),
  namespace: z.string().min(1)
});


// Route identity only -- which four pages exist, their message namespace and
// hero image. The factual record of what each programme *is* lives in
// asaProgramSchema / hkictProgramSchema / cpaiProgramSchema / tctProgramSchema
// at the foot of this file. The two are a confusable pair; nothing factual
// about a programme belongs here.
export const programSchema = z.object({
  id: z.enum(['cpai', 'hkict', 'tct', 'asa']),
  namespace: z.string().min(1),
  image: z.string().startsWith('/')
});

export type EventRecord = z.infer<typeof eventSchema>;
export type ProgramRecord = z.infer<typeof programSchema>;

const milestoneImageSchema = z.object({
  // Own-origin under a dedicated prefix. The CSP is `img-src 'self' data:` and
  // next.config.ts declares no remotePatterns, so a remote src renders nothing.
  src: z.string().regex(/^\/images\/history\/[A-Za-z0-9._-]+$/),
  altEn: z.string().min(1),
  altZh: z.string().min(1)
});

export const milestoneSchema = z.object({
  slug,
  // The captured archive mixes three different things under one post type:
  // WTIA's own institutional record, "Meet Our Member" interviews with member
  // companies, and third-party vendor press releases WTIA merely republished.
  // `kind` decides which surface each lands on (Task 10 redirects) rather than
  // dropping either non-milestone kind, and gates whether `featured` can be
  // true — a member interview is long because interviews are long, not
  // because it earned a place in WTIA's own history timeline.
  kind: z.enum(['milestone', 'member-story', 'press-release']),
  year: z.number().int().min(2001).max(2100),
  month: z.string().regex(/^(0[1-9]|1[0-2])$/),
  titleEn: z.string().min(1),
  titleZh: z.string().min(1),
  bodyEn: z.string().min(1),
  bodyZh: z.string().min(1),
  images: z.array(milestoneImageSchema),
  // The source URL. Task 9 maps these to redirect destinations, so the shape is
  // pinned rather than free text. `%` is allowed in the final segment because
  // WordPress falls back to a percent-encoded slug for a Chinese title with no
  // manual slug set (12 of the 61 real posts) -- confirmed against the actual
  // capture and against content/legacy-urls.json, which stores the same
  // encoded form as the redirect source Task 10 matches against verbatim.
  legacyPath: z.string().regex(/^\/\d{4}\/\d{2}\/[a-z0-9%-]+\/$/),
  // Frozen at extraction from the word-count threshold, never recomputed at
  // render time — otherwise a copy edit could move an entry between layouts and
  // change its URL.
  featured: z.boolean()
});

export type MilestoneRecord = z.infer<typeof milestoneSchema>;

// Own-origin under a dedicated prefix, for the same reason milestoneImageSchema
// pins /images/history/: the CSP is `img-src 'self' data:` and next.config.ts
// declares no remotePatterns, so a remote src renders nothing.
const programImageSchema = z.object({
  src: z.string().regex(/^\/images\/programs\/[A-Za-z0-9._-]+$/),
  altEn: z.string().min(1),
  altZh: z.string().min(1)
}).strict();

const winnerSchema = z.object({
  nameEn: z.string().min(1),
  // Repeating the English name here is the intended answer for a company with
  // no Chinese form -- RIFFAI and 417 Technology are both written that way on
  // the 2025 page. Do not "fix" this by inventing a Chinese name for them.
  nameZh: z.string().min(1),
  categoryEn: z.string().min(1),
  categoryZh: z.string().min(1)
  // .strict() so an editor who reaches for a field that does not exist is told
  // so. The archive never describes what a winner built, and a silently
  // dropped `descriptionEn` would let someone believe they had published one.
}).strict();

/**
 * Absence is stated, never inferred from an empty array.
 *
 * The archive does not name the ASA 2020 or 2021 winners -- both editions defer
 * to microsites that were never captured -- nor the HKICT winners for 2021,
 * 2022 and 2024. `winners: []` would be indistinguishable from an unfinished
 * entry, so each edition has to declare which case it is, and the page renders
 * a link or an explicit line rather than an empty table.
 */
const winnersSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('listed'), entries: z.array(winnerSchema).min(1)}).strict(),
  // `.url()` alone would accept `mailto:` and `javascript:`. Both known
  // microsites are https (contest2020/contest2021.bestasiaapp.hk), and this
  // value is rendered as a link, so the scheme is pinned.
  z.object({kind: z.literal('off-site'), url: z.string().regex(/^https:\/\//)}).strict(),
  z.object({kind: z.literal('unrecorded')}).strict()
]);

/**
 * Funding is per edition and the agency set is per programme.
 *
 * The content audit called ASA "CCIDA-funded" as though that held throughout.
 * It does not: CCIDA appears only from 2024, and every documented edition from
 * 2017 through 2022/23 names Create Hong Kong under the CreateSmart Initiative.
 * A shared agency enum would let CCIDA be written against a 2017 edition; a
 * per-programme one will not.
 *
 * `const T` is load-bearing, not decoration. Without it the argument widens to
 * `readonly string[]` and every `agency` becomes plain `string`: the runtime
 * parse still rejects `agency: 'gsp'` on an ASA edition, but the compiler stops
 * doing so, which is most of the protection. `tests/unit/program-schema.test.ts`
 * pins both halves -- the runtime one with `.parse`, the type one with
 * `@ts-expect-error`, since a test that only parses cannot see this regress.
 */
const fundingSchema = <const T extends readonly [string, ...string[]]>(agencies: T) =>
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('named'),
      agency: z.enum(agencies),
      initiativeEn: z.string().min(1),
      initiativeZh: z.string().min(1)
    }).strict(),
    // The archive names no funder for this edition. Distinct from "not yet
    // filled in", and the page says nothing about funding rather than guessing.
    z.object({kind: z.literal('none-recorded')}).strict()
  ]);

/**
 * There is deliberately no venue field.
 *
 * It was considered and dropped. The article region of the 2013, 2016, 2017,
 * 2019 and 2020 edition pages names no venue at all, and 2024 gets only as far
 * as "right here in Hong Kong" -- a city, not a place. A required venue would
 * leave a transcriber two ways out, inventing one from general knowledge or
 * editing this schema, and the first is the exact failure this file exists to
 * prevent. Do not add it back without a page that actually states one.
 */
export const asaProgramSchema = z.object({
  id: z.literal('asa'),
  editions: z.array(z.object({
    // The edition's name as its own page writes it, not merely a year span.
    // Both vary: "2022/23" is a single edition, and the lineage runs Asia
    // Smartphone Apps Contest -> Asia Smart App Awards -> Asia Smart Innovation
    // Awards, so the per-edition name has nowhere else to live.
    label: z.string().min(1),
    // 2013 is the first edition -- "WTIA started to organize Asia Smartphone
    // Contest in 2013" -- so an earlier year is a transcription error.
    yearStart: z.number().int().min(2013).max(2100),
    funder: fundingSchema(['createhk', 'ccida']),
    /**
     * Two different measurements, never flattened into one number.
     *
     * The audit read "16 regional co-organisers" off a page that says 16
     * regions attended. The archive really does say both things, in two eras:
     * 2013 "7 Asia Regions, including Israel, ... was the co-organizer of the
     * Contest" and 2016 the same sentence with 9; but 2017 "successfully
     * gather 11 participating countries/ regions", 13 in 2019, 15 in 2020, and
     * 2024 "industry experts from 16 Asian regions". A single field named for
     * attendance forces the 2013 transcriber either to write 7 as an
     * attendance count -- manufacturing the contradicted claim in reverse --
     * or to drop a documented fact.
     *
     * 2025 is `unrecorded`: the home page asserts 17 while its own Regional
     * Partners carousel renders 15 logos. The claims review asks WTIA which is
     * right, so the record stays silent rather than picking a side.
     */
    regions: z.discriminatedUnion('kind', [
      z.object({kind: z.literal('attended'), count: z.number().int().positive()}).strict(),
      z.object({kind: z.literal('co-organisers'), count: z.number().int().positive()}).strict(),
      z.object({kind: z.literal('unrecorded')}).strict()
    ]),
    winners: winnersSchema,
    images: z.array(programImageSchema)
  }).strict()).min(1)
}).strict();

export const hkictProgramSchema = z.object({
  id: z.literal('hkict'),
  editions: z.array(z.object({
    // The ICT Startup Award stream begins with the 2020 edition. The 2006 Best
    // Ubiquitous Award, renamed Best Mobile Apps Award in 2013, is a different
    // stream the audit wrongly folded in; the floor keeps it out.
    year: z.number().int().min(2020).max(2100),
    // OGCIO for 2020-2024, DPO from 2025. Programme-level would collapse them.
    organisedFor: z.enum(['ogcio', 'dpo']),
    winners: winnersSchema,
    images: z.array(programImageSchema)
  }).strict()).min(1)
}).strict();

/**
 * CPAI is a credential, not an event series: no editions, no winners, no years.
 *
 * WTIA issues CPAI alone. CUSCS separately issues its own completion
 * certificate to the same graduates -- 「一個課程，兩張認證」. The audit called it
 * a "joint WTIA x CUSCS certification", which understates what WTIA owns, so
 * the issuer and the course partner are separate required fields and there is
 * no field in which a joint issuer can be written.
 */
export const cpaiProgramSchema = z.object({
  id: z.literal('cpai'),
  issuerEn: z.string().min(1),
  issuerZh: z.string().min(1),
  coursePartnerEn: z.string().min(1),
  coursePartnerZh: z.string().min(1),
  courseNameEn: z.string().min(1),
  courseNameZh: z.string().min(1),
  // The other half of 「一個課程，兩張認證」. Refusing to represent a joint issuer
  // is only half the correction -- without somewhere to name CUSCS's own
  // completion certificate the record still cannot state the real arrangement,
  // and a reader learns only that CUSCS teaches the course. The course page is
  // explicit: 「完成課程後同時獲頒 ... CUSCS 結業證書」.
  partnerCertificateEn: z.string().min(1),
  partnerCertificateZh: z.string().min(1),
  // .min(1) for the same reason the winners union exists: an empty array under
  // a "Syllabus" heading renders as a heading with nothing beneath it. The
  // course page lists 四大模組, so there is something to write.
  syllabus: z.array(z.object({
    titleEn: z.string().min(1),
    titleZh: z.string().min(1)
  }).strict()).min(1),
  images: z.array(programImageSchema)
}).strict();

export const tctProgramSchema = z.object({
  id: z.literal('tct'),
  editions: z.array(z.object({
    // Same reason ASA has one: an edition is not reliably a calendar year and
    // is not reliably called by one. The first edition runs 2021-22, the 2023
    // edition's own name is "Tech to Connect 4.0", and the series was renamed
    // to Tech Connect (智創互聯) mid-run -- a rename the page classifier already
    // has to match on. Write the name the page uses.
    label: z.string().min(1),
    // The 2019 TechConnect Conference & Festival is a same-named predecessor,
    // not edition zero: no "Tech to Connect" branding, no edition number, and
    // the 2023 summit calls 2021-22 the first edition. The floor keeps it out.
    year: z.number().int().min(2021).max(2100),
    // Free text, not workshop and seminar counts: the first edition (2021-22)
    // was 12 workshops and 4.0 (2023) was 10 workshops plus 2 seminars and a
    // conference. A count-shaped field invites applying one edition's structure
    // to all of them, which is how the audit got this wrong.
    shapeEn: z.string().min(1),
    shapeZh: z.string().min(1),
    // GSP is named exactly once in 577 pages, on the July 2023 seminar page.
    // The 2024-26 editions never mention it.
    funder: fundingSchema(['gsp']),
    images: z.array(programImageSchema)
  }).strict()).min(1)
}).strict();

export type AsaProgram = z.infer<typeof asaProgramSchema>;
export type HkictProgram = z.infer<typeof hkictProgramSchema>;
export type CpaiProgram = z.infer<typeof cpaiProgramSchema>;
export type TctProgram = z.infer<typeof tctProgramSchema>;
export type ProgramWinners = z.infer<typeof winnersSchema>;
export type ProgramImage = z.infer<typeof programImageSchema>;

// Named so callers stop writing `AsaProgram['editions'][number]` by hand.
export type AsaEdition = AsaProgram['editions'][number];
export type HkictEdition = HkictProgram['editions'][number];
export type TctEdition = TctProgram['editions'][number];
export type AsaRegions = AsaEdition['regions'];

// For render helpers that take a funder from either funded programme. The two
// member types stay distinct -- this union does not let an ASA edition hold a
// TCT agency, it only lets one function accept both.
export type ProgramFunder = AsaEdition['funder'] | TctEdition['funder'];
