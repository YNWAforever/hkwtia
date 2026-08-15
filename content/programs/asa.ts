import {asaProgramSchema, type AsaProgram} from '@/content/schemas';

/**
 * Transcribed from the captured archive, not from
 * docs/wtia-content-migration-audit.md, which is wrong about this programme's
 * funder for six editions. docs/wtia-programme-claims-review.md records what
 * the archive actually says.
 *
 * Every funder, region figure and winner name below was read off a captured
 * page; the page is named in the comment beside it. Four values are drafted
 * rather than transcribed, and each is marked `DRAFTED` where it appears:
 *
 * 1. `funder.initiative.zh` on the two editions that have an initiative at all
 *    — the archive never writes the CreateSmart Initiative's Chinese name
 *    (`grep 創意智優` over all 577 pages returns nothing). The rendering used
 *    matches the fixture already in tests/unit/program-schema.test.ts. It
 *    belongs in docs/wtia-translation-review.md Table A alongside "SME
 *    Development Fund", the other official scheme name the archive does not
 *    corroborate. `initiative` is null on the other four funded editions:
 *    "CreateSmart" appears in exactly two of 577 pages, both ASA workshop
 *    disclaimers (2020-07-23, CreateHK; 2024-08-15, CCIDA), so only the 2020
 *    and 2024 editions can name it.
 * 2. `labelZh` on the eight editions whose pages are English-only — repeated
 *    from `labelEn` per asaProgramSchema's instruction, rather than inventing a
 *    Chinese award name. Only ASA 2022/23 and ASA 2025 have a real Chinese
 *    name in the archive, and both are transcribed.
 * 3. `nameZh` on every winner — no winner is named in Chinese anywhere, so the
 *    English name is repeated, which winnerSchema's comment calls the intended
 *    answer for a company with no Chinese form.
 * 4. `categoryZh` on the 2024 winners — the 2024 ceremony page is English-only.
 *    The 22/23 press-conference page does give Chinese for three of the same
 *    category names (公共事務及社會創新獎, 商業應用獎, 生活及娛樂獎), but that
 *    is a different edition's page and this record does not carry a fact from
 *    one edition to another. See the task report.
 *
 * Two winner sets are deliberately incomplete rather than absent. Kick-off
 * pages name four ASA 2020 winners and five ASA 2021 winners in prose, as
 * returning panellists, with no apps and no categories. A full list exists for
 * neither year, and `listed` cannot say "some of".
 *
 * Nothing here describes what a winner built: the archive never does, for any
 * edition, and winnerSchema is `.strict()` so that the omission is loud.
 */
export const asa: AsaProgram = asaProgramSchema.parse({
  id: 'asa',
  editions: [
    {
      // 2013-01 post. Its own body is the sentence the schema's yearStart floor
      // quotes: "WTIA started to organize Asia Smartphone Contest in 2013".
      labelEn: 'Asia Smartphone Contest',
      labelZh: 'Asia Smartphone Contest', // DRAFTED: page is English-only.
      yearStart: 2013,
      // The post names no funder at all. Do not fill this in from 2017's page.
      funder: {kind: 'none-recorded'},
      // "7 Asia Regions, including Israel, Mainland China, Japan, Korea,
      // Malaysia, Singapore, Taiwan was the co-organizer of the Contest."
      regions: {kind: 'co-organisers', count: 7},
      // No winner is named on any 2013 page.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2015-01 post, "2015 – Asia Smartphone Apps Contest & Summit 2015".
      labelEn: 'Asia Smartphone Apps Contest & Summit 2015',
      labelZh: 'Asia Smartphone Apps Contest & Summit 2015', // DRAFTED: English-only.
      yearStart: 2015,
      funder: {kind: 'none-recorded'},
      // The page carries 2013's co-organiser sentence forward unchanged — same
      // 7, same region list, differing only in British spelling and one comma.
      // That comma is the point: 2013's page ends the clause with a full stop,
      // while here it binds to "started to organise ... in 2013", making the
      // sentence an origin-story recap rather than a statement about 2015.
      // 2016 earns its figure because someone edited the number to 9; this page
      // never did, so it records nothing about its own edition.
      regions: {kind: 'unrecorded'},
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2016-01 post.
      labelEn: 'Asia Smartphone Apps Summit cum Award Presentation Ceremony 2016',
      labelZh: 'Asia Smartphone Apps Summit cum Award Presentation Ceremony 2016', // DRAFTED: English-only.
      yearStart: 2016,
      funder: {kind: 'none-recorded'},
      // Same sentence again, with 9 — the change in the number between 2013,
      // 2015 and 2016 is what makes it this edition's figure and not boilerplate.
      regions: {kind: 'co-organisers', count: 9},
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2017-01 post, "2017 – Asia Smart App Summit cum Award Presentation
      // Ceremony". The rename to Asia Smart App Awards lands here: the body
      // says "the Asia Smart App Awards (formerly known as Asia Smartphone
      // Apps Contest)".
      labelEn: 'Asia Smart App Summit cum Award Presentation Ceremony',
      labelZh: 'Asia Smart App Summit cum Award Presentation Ceremony', // DRAFTED: English-only.
      yearStart: 2017,
      // "With funding support from Create Hong Kong of the Government of the
      // Hong Kong Special Administrative Region", and it stops there. The
      // CreateSmart Initiative attribution for 2017–2022/23 is the claims
      // review's, not this page's — "CreateSmart" appears in exactly two of 577
      // pages, both workshop disclaimers — so the scheme is left null.
      funder: {kind: 'named', agency: 'createhk', initiative: null},
      // "successfully gather 11 participating countries/ regions in Asia".
      // Participation, not co-organisation — the two are never interchanged.
      regions: {kind: 'attended', count: 11},
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2019-01 post, "2019 – Asia Smart App Awards 2018/ 2019". One edition
      // spanning two years, which is why yearStart is 2018 and the label
      // carries the span.
      labelEn: 'Asia Smart App Awards 2018/2019',
      labelZh: 'Asia Smart App Awards 2018/2019', // DRAFTED: English-only.
      yearStart: 2018,
      // Same "With funding support from Create Hong Kong" sentence, and again
      // no scheme named on the page.
      funder: {kind: 'named', agency: 'createhk', initiative: null},
      // "successfully gather 13 participating countries/ regions in Asia".
      regions: {kind: 'attended', count: 13},
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2020-01 post; the 2020-01-20 kick-off calls it "the 7th Edition".
      labelEn: 'Asia Smart App Awards 2020',
      labelZh: 'Asia Smart App Awards 2020', // DRAFTED: English-only.
      yearStart: 2020,
      // Same sentence again on the 2020-01 post. The 2020-07-23 ASA workshop
      // page carries the full disclaimer naming Create Hong Kong and the
      // CreateSmart Initiative Secretariat, which is where the scheme name for
      // this era is actually written down.
      funder: {
        kind: 'named',
        agency: 'createhk',
        initiative: {
          en: 'CreateSmart Initiative',
          zh: '創意智優計劃' // DRAFTED: no Chinese form in 577 pages.
        }
      },
      // "successfully gather 15 participating countries/ regions in Asia".
      regions: {kind: 'attended', count: 15},
      // The presentation ceremony page says, verbatim, "Full list of Award
      // Winners will be uploaded: https://contest2020.bestasiaapp.hk/" — a bare
      // url the archive itself writes, and an explicit statement that the
      // results live there. The microsite was not captured. The 2021-11-23
      // kick-off page does name four ASA 2020 winners in prose (Visionaries
      // 777, Pokeguide, SOCIF, InnoSpire Technology) as returning panellists,
      // with no apps and no categories; `listed` would assert a completeness
      // that partial set does not have, and the schema cannot qualify it.
      winners: {kind: 'off-site', url: 'https://contest2020.bestasiaapp.hk/'},
      images: []
    },
    {
      // The 2021-11-23 kick-off page: "The 8th edition of the ASA". Its awards
      // ceremony finally ran on 2022-06-23 after a pandemic postponement, but
      // the edition is the archive's "Asia Smart App Awards 2021".
      labelEn: 'Asia Smart App Awards 2021',
      labelZh: 'Asia Smart App Awards 2021', // DRAFTED: English-only.
      yearStart: 2021,
      // Kick-off page: "organised by ... (WTIA) and sponsored by Create Hong
      // Kong (CreateHK) of the Government of the Hong Kong Special
      // Administrative Region". The Asia Smart App Summit 2021 page repeats it.
      // Neither names a scheme.
      funder: {kind: 'named', agency: 'createhk', initiative: null},
      // Summit page: "the representative of the 13 regional partners from
      // Bangladesh, Cambodia, Israel, India, Indonesia, Japan, Malaysia,
      // Myanmar, the Mainland, Sri Lanka, Taiwan, Thailand and Vietnam" —
      // thirteen names for thirteen. "Regional partners" is the same
      // measurement as "participating countries/ regions", not a third one:
      // 2020 states both, with the same count and the same fifteen regions in
      // the same order (edition page "15 participating countries/ regions in
      // Asia, namely the Cambodia, Israel, India, ..."; summit page "15
      // regional partners from Cambodia, Israel, India, ...").
      regions: {kind: 'attended', count: 13},
      // Unlike 2020, nothing says the 2021 winners were published anywhere. The
      // ceremony page carries only a `Website:` field pointing at that
      // ceremony's own sub-page of the microsite; the bare microsite url
      // appears nowhere in the capture, so `off-site` here would mean linking
      // to a url this record invented. The 2023-01-05 kick-off page names five
      // ASA 2021 winners in prose (HKT, CheckPlus, ANIWARE, Dayta AI, and
      // Dr.Go/HKT) as returning panellists — a partial set, no apps, no
      // categories, so not a `listed` winner set either.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2023-01-05 kick-off page: "The 9th edition of t he Awards". One edition
      // spanning 2022 and 2023, hence yearStart 2022.
      labelEn: 'Asia Smart App Awards 2022/2023',
      // Transcribed: the 2023-05-16 industry survey press conference page is
      // Chinese and writes 「2022/23亞洲智能應用程式大獎」.
      labelZh: '2022/23亞洲智能應用程式大獎',
      yearStart: 2022,
      // Kick-off page: "with the funding support from Create Hong Kong
      // (CreateHK)". The press conference page says the same in Chinese:
      // 「香港特別行政區政府『創意香港』贊助」. This is the last CreateHK edition.
      // Neither page names a scheme.
      funder: {kind: 'named', agency: 'createhk', initiative: null},
      // The only figure is on the Asia Smart App Summit 2022/23 page, and the
      // sentence contradicts itself: "the 15 regional partners from
      // Bangladesh, Cambodia, Israel, India, Japan, Korea, Malaysia, Myanmar,
      // Philippines, Singapore, Sri Lanka, Taiwan, Thailand and Vietnam" lists
      // fourteen. 2021's identical phrasing is recorded because its thirteen
      // names match its thirteen; this one has no figure to trust.
      regions: {kind: 'unrecorded'},
      // The press conference page publishes a 「九強名單」 — a nine-strong
      // shortlist "排名不分先後", explicitly not a result. No captured page
      // names a 2022/23 winner.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // 2024-03-22 kick-off page: "the 10th edition of the Asia Smart App
      // Awards"; the 2024-09-11 ceremony page is the source for everything below.
      labelEn: 'Asia Smart App Awards 2024',
      labelZh: 'Asia Smart App Awards 2024', // DRAFTED: English-only.
      yearStart: 2024,
      // The first CCIDA edition. The 2024-08-15 ASA workshop page — whose own
      // event website is contest2024.bestasiaapp.hk — states it outright:
      // "Sponsor: The Culture and Creative Industries Development Agency" and
      // "The Cultural and Creative Industries Development Agency ... provides
      // funding support to the project only ... the CreateSmart Initiative
      // Secretariat". The ceremony page independently bills its guest of honour
      // as CCIDA's Assistant Commissioner. No 2024 page names CreateHK.
      funder: {
        kind: 'named',
        agency: 'ccida',
        initiative: {
          en: 'CreateSmart Initiative',
          zh: '創意智優計劃' // DRAFTED: no Chinese form in 577 pages.
        }
      },
      // "bringing together representatives from 16 Asian regions right here in
      // Hong Kong", and the summit page: "industry experts from 16 Asian
      // regions". Attendance — the audit's "16 regional co-organisers" is the
      // contradicted claim this union exists to prevent.
      regions: {kind: 'attended', count: 16},
      // Transcribed from the ceremony page's own prose list, not from photo
      // captions. Its three "Sliver Award" typos are written as "Silver".
      // categoryZh repeats the English: the page is English-only.
      winners: {
        kind: 'listed',
        entries: [
          {
            nameEn: 'VITALERTER by VITALERTER (Israel)',
            nameZh: 'VITALERTER by VITALERTER (Israel)',
            categoryEn: 'Grand Award',
            categoryZh: 'Grand Award'
          },
          {
            nameEn: 'AIM by AIM Inc. (Korea)',
            nameZh: 'AIM by AIM Inc. (Korea)',
            categoryEn: 'Business and Commercial — Gold Award',
            categoryZh: 'Business and Commercial — Gold Award'
          },
          {
            nameEn: 'Store Optimizer by Palexy (Vietnam)',
            nameZh: 'Store Optimizer by Palexy (Vietnam)',
            categoryEn: 'Business and Commercial — Silver Award',
            categoryZh: 'Business and Commercial — Silver Award'
          },
          {
            nameEn: 'Agmo EV Super App by Agmo Holdings Limited (Malaysia)',
            nameZh: 'Agmo EV Super App by Agmo Holdings Limited (Malaysia)',
            categoryEn: 'Business and Commercial — Bronze Award',
            categoryZh: 'Business and Commercial — Bronze Award'
          },
          {
            nameEn: 'Blua Health by Bupa (Asia) Limited (Hong Kong)',
            nameZh: 'Blua Health by Bupa (Asia) Limited (Hong Kong)',
            categoryEn: 'Lifestyle and Entertainment — Gold Award',
            categoryZh: 'Lifestyle and Entertainment — Gold Award'
          },
          {
            nameEn: 'Solos AirGo App by Solos Technology Limited (Hong Kong)',
            nameZh: 'Solos AirGo App by Solos Technology Limited (Hong Kong)',
            categoryEn: 'Lifestyle and Entertainment — Silver Award',
            categoryZh: 'Lifestyle and Entertainment — Silver Award'
          },
          {
            nameEn: 'O+O MetaEvent Hub by Chef Digital Limited (Hong Kong)',
            nameZh: 'O+O MetaEvent Hub by Chef Digital Limited (Hong Kong)',
            categoryEn: 'Lifestyle and Entertainment — Bronze Award',
            categoryZh: 'Lifestyle and Entertainment — Bronze Award'
          },
          {
            // The page writes the grand award winner's app as "VITALERTER" and
            // this one as "Vitalerter"; both are kept as written.
            nameEn: 'Vitalerter by VITALERTER (Israel)',
            nameZh: 'Vitalerter by VITALERTER (Israel)',
            categoryEn: 'Public Sector and Social Innovation — Gold Award',
            categoryZh: 'Public Sector and Social Innovation — Gold Award'
          },
          {
            nameEn: 'paperless by Muslimlife (PT. Digital Kreasi Muslim) (Indonesia)',
            nameZh: 'paperless by Muslimlife (PT. Digital Kreasi Muslim) (Indonesia)',
            categoryEn: 'Public Sector and Social Innovation — Silver Award',
            categoryZh: 'Public Sector and Social Innovation — Silver Award'
          },
          {
            nameEn: 'Silang App by Silang.id (Indonesia)',
            nameZh: 'Silang App by Silang.id (Indonesia)',
            categoryEn: 'Public Sector and Social Innovation — Bronze Award',
            categoryZh: 'Public Sector and Social Innovation — Bronze Award'
          },
          {
            nameEn: 'ReCube Reusable Tableware Rental Service by ReCube (Hong Kong)',
            nameZh: 'ReCube Reusable Tableware Rental Service by ReCube (Hong Kong)',
            categoryEn: 'Special Mention Award of The Best Startup',
            categoryZh: 'Special Mention Award of The Best Startup'
          },
          {
            nameEn: 'Blua Health by Bupa (Asia) Limited (Hong Kong)',
            nameZh: 'Blua Health by Bupa (Asia) Limited (Hong Kong)',
            categoryEn: 'Special Mention Award of The Best UX/UI Design',
            categoryZh: 'Special Mention Award of The Best UX/UI Design'
          }
        ]
      },
      images: []
    },
    {
      // 2025-11 post, the only bilingual edition page in the archive. Its title
      // is "2025 亞洲智慧創新大獎 Asia Smart Innovation Awards 2025", so that is
      // the name used here. The same post calls the top prize
      // 「亞洲智能創新大獎」 — 智慧 in the title, 智能 for the award, which is
      // claims review §1's open question to WTIA. Both forms are kept where the
      // post puts them rather than being reconciled here.
      labelEn: 'Asia Smart Innovation Awards 2025',
      labelZh: '2025 亞洲智慧創新大獎',
      yearStart: 2025,
      // No captured 2025 page names a funder — neither the post nor the summit
      // page. CCIDA funded 2024, and that fact stops at 2024.
      // The home page's ASA card, duplicated in hkwtia-org-slide-page-home.html:
      // WTIA "organises the Asia Smart Innovation Awards (ASA) 2025, with
      // funding support from he [sic] Cultural and Creative Industries
      // Development Agency (CCIDA) of the Government of the Hong Kong Special
      // Administrative Region." Neither the November post nor the summit page
      // names a funder; the home page does, and it names CCIDA. No scheme.
      funder: {kind: 'named', agency: 'ccida', initiative: null},
      // That same sentence continues "Uniting 17 regional co-organisers" — so
      // 2025 does have an explicit co-organiser figure, and it is the only one
      // after 2016. It is not recorded because the page contradicts itself
      // internally: the Regional Partners carousel further down that same page
      // renders exactly 15 logos (RP_R1 … RP_R15). The claims review asks WTIA
      // to settle 17 against 15; until they do, the record states neither.
      regions: {kind: 'unrecorded'},
      // The only two winners the post names, and the only category it names.
      // Neither company has a Chinese name in the archive; neither product is
      // described anywhere in the capture, and there is no field to describe it.
      winners: {
        kind: 'listed',
        entries: [
          {
            // "the Thai team RIFFAI" / 「泰國團隊 RIFFAI」. The region is carried
            // in the name for the same reason as the 2024 entries.
            nameEn: 'RIFFAI (Thailand)',
            nameZh: 'RIFFAI (Thailand)',
            categoryEn: 'Asia Smart Innovation Grand Award',
            categoryZh: '亞洲智能創新大獎'
          },
          {
            // "Hong Kong representatives also delivered outstanding
            // performances, with 417 Technology Limited securing the Silver
            // Award".
            nameEn: '417 Technology Limited (Hong Kong)',
            nameZh: '417 Technology Limited (Hong Kong)',
            categoryEn: 'Living & Culture — Silver Award',
            categoryZh: '「生活與文化組別」銀獎'
          }
        ]
      },
      images: []
    }
  ]
});
