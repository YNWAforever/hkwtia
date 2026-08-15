import {tctProgramSchema, type TctProgram} from '@/content/schemas';

/**
 * Transcribed from the captured archive, not from
 * docs/wtia-content-migration-audit.md, which gives TCT's shape as "10 industry
 * workshops + 2 seminars + grand conference" as though that held for the
 * programme. It describes Tech to Connect 4.0 (2023) and nothing else — the
 * first edition's own kick-off page states a different structure outright, and
 * the two later editions are different again.
 * docs/wtia-programme-claims-review.md §4 records what the archive says.
 *
 * There is no TCT landing page in the capture: the site's navigation links
 * off-site to `techtoconnect.net`, which was not captured. Every field below
 * comes from an individual event listing, named in the comment beside it.
 *
 * `shapeEn` and `shapeZh` are the exception to transcribe-as-written, and
 * deliberately so. No page writes a one-line summary of its own edition, so
 * each of the eight values is a sentence composed here from facts that are
 * transcribed; the sourcing sentence is quoted in the comment above each. The
 * field is free text rather than workshop and seminar counts precisely because
 * the editions do not share a structure — see tctProgramSchema's comment.
 * Every `shapeZh` is additionally DRAFTED as translation: the 2021 and 2023
 * editions are English-only in the archive, and the 2024 and 2026 editions
 * write no Chinese summary of themselves either.
 *
 * Also drafted, and marked where it appears:
 *
 * 1. `labelZh` on the 2021 and 2023 editions — every page of both is
 *    English-only, so the English name is repeated rather than a Chinese series
 *    name being invented. The series does acquire one, 智創互聯, but only from
 *    2024; back-dating it onto the 5G/IoT editions would name them something
 *    WTIA never called them.
 *
 * Two things the archive shows that this record deliberately does not carry:
 *
 * - **A speaker count for the AI Leaders' Summit.** Its own page says
 *   「十五位來自不同企業的講者嘉賓」 in one sentence and 「十八位科技領袖」 in the
 *   next, and names none of them. tctProgramSchema has no field for a count,
 *   and `shape*` is not the place to smuggle one in.
 * - **"Over 15 experts from Huawei, Microsoft, HKPC".** The claims review says
 *   this audit claim has no support in the archive. It does have support, on a
 *   page the surveys appear to have missed:
 *   `hkwtia-org-2025-05-…tech-connect-ai-leaders-seminar-series.html` says it in
 *   both locales — 「邀請超過 15 位來自華為、Microsoft、HKPC 等知名企業的技術
 *   專家」 / "featured over 15 tech experts from renowned organizations such as
 *   Huawei, Microsoft, and HKPC". It is still not published, because it is a
 *   third count for the same summit alongside that summit page's own fifteen
 *   and eighteen, and because no speaker from any of the three is named
 *   anywhere. Flagged in the task report for the claims review to correct.
 *
 * One of the 36 pages content/program-pages.json lists for TCT belongs to no
 * edition here: `hkwtia-org-event-wtia-tech-to-connect-seminar-govirtual-
 * business-expo.html`, WTIA's "Tech to Connect Seminar" at the GoVirtual
 * Business Expo on 10 June 2021. It predates the 26 August 2021 kick-off, says
 * nothing about being part of the series, and the kick-off's own "two Public
 * Awareness Seminars" are accounted for by that kick-off and the March 2022
 * closing seminar. Folding it into the first edition would add a third. Raised
 * in the task report.
 *
 * The 2019 TechConnect Conference & Festival is absent by design: a same-named
 * predecessor with no "Tech to Connect" branding and no edition number, which
 * tctProgramSchema's 2021 floor keeps out. The 2023 summit page calling 4.0 the
 * "2nd edition" is what makes 2021–22 the first.
 *
 * ONE FINDING THIS RECORD CANNOT HOLD, AND IT IS THE IMPORTANT ONE.
 *
 * `funder` records a scheme with no body attached, because the archive's *text*
 * names GSP once and never says who administers it. That is true of the text
 * and false of the archive. This edition's own speaker line-up graphic
 * (TTC_9.jpg, attached below) prints, beside "Organiser WTIA":
 *
 *     Funding Organisation  創新科技署  Innovation and Technology Commission
 *
 * GSP is the ITC's General Support Programme, so the two agree. A hashtag on
 * the July 2025 workshop wrap-up (「#創新科技署」) says the same thing a third
 * time. `tctProgramSchema` has no agency field to put it in -- deliberately, on
 * the evidence available when it was written -- so the fact lives here and on
 * the claims review rather than on the page.
 *
 * The general lesson is worth more than this instance: every value in all four
 * programme records was transcribed from page text, and WTIA puts funder
 * attributions, sponsor logos and speaker rosters in images. A text-only sweep
 * of this archive is not a complete sweep of it.
 */
export const tct: TctProgram = tctProgramSchema.parse({
  id: 'tct',
  editions: [
    {
      // hkwtia-org-event-…-kick-off-seminar-unleashing-the-unprecedented-
      // opportunities-in-a-new-tech-era.html, 26 August 2021. Its own title
      // writes 「【Tech To Connect Series】」 and the March 2022 closing seminar
      // writes "Tech to Connect Series"; the edition has no distinguishing name
      // of its own in the capture, because it was the only one when it ran. The
      // January 2023 IIoT seminar page refers back to it as "TECH TO CONNECT
      // 2021" in link text, which is a url label rather than the series' name.
      labelEn: 'Tech to Connect Series',
      labelZh: 'Tech to Connect Series', // DRAFTED: every page of this edition is English-only.
      // Runs August 2021 to March 2022; `year` is the start year.
      year: 2021,
      // Composed from the kick-off page's own sentence, which is the only
      // structural statement any TCT page makes about its own edition: "This
      // Series consists of two Public Awareness Seminars, a TechConnect
      // Conference and a total of 12 Technical workshops where experts and
      // professionals in the ICT domain will share their insightful ideas on
      // the application of 5G and IoT."
      //
      // The captured event pages match it exactly, which is why the claims
      // review's "12 workshops" is right and the audit's structure is not:
      // twelve workshop listings (2021-09-30, 10-07, 11-04, 11-11, 12-15,
      // 12-30, 2022-01-13, 01-27, 02-10, 02-24, 03-03, 03-16), the
      // 2021-12-02 "Tech to Connect Conference: Be One Step Ahead", and the two
      // seminars that bracket the run — this kick-off and the 2022-03-23
      // "Closing Seminar | Build a Connected City with 5G and IoT".
      shapeEn: 'Two public awareness seminars, a TechConnect Conference and twelve technical workshops on 5G and IoT.',
      shapeZh: '兩場公眾認知研討會、一場 TechConnect 會議，以及十二場關於 5G 與物聯網的技術工作坊。', // DRAFTED.
      // No page of this edition names a funder or a scheme. `grep -i funding`
      // over all 36 indexed TCT pages hits exactly one, and it is the July 2023
      // page below.
      funder: {kind: 'none-recorded'},
      images: []
    },
    {
      // hkwtia-org-event-tech-to-connect-4-0-leaders-summit-transforming-smart-
      // lead-through-industry-4-0.html, 20 April 2023: "As the 2nd edition of
      // the Tech to Connect Series, Tech to Connect 4.0 aims to drive the
      // growth of Hong Kong Information communication technology (ICT) and the
      // local Manufacturing Sector". The edition names itself 4.0 while being
      // the second; no "2.0" or "3.0" exists in the 577 pages.
      labelEn: 'Tech to Connect 4.0',
      labelZh: 'Tech to Connect 4.0', // DRAFTED: every page of this edition is English-only.
      year: 2023,
      // Composed from two sentences on this edition's own pages. The summit
      // page describes the means in general terms — "through organising
      // seminars, conferences, workshops and exhibitions" — and the 25 July
      // 2023 seminar page counts them: "The campaign has already held 10
      // workshops covering topics such as artificial intelligence technology,
      // mechanical equipment, cloud technology, network security, and ESG
      // development."
      //
      // Ten is corroborated by the capture: ten "Technical Enhancement
      // Workshops" listings (2023-01-17, 01-19, 02-14, 03-02, 03-23, 04-27,
      // 05-18, 06-08, 06-29, 07-11), plus two seminars — 2023-01-04
      // "Empowering with Industrial IoT (IIoT)" and 2023-07-25 "The Journey of
      // Industry 4.0 and Future Trends" — and the April summit. The audit's
      // structure is this edition's and is described here as this edition's.
      // The summit's own title is "Leaders Summit", not a conference; the
      // audit's "grand conference" is the 2021 edition's word.
      shapeEn: 'Ten technical enhancement workshops on Industry 4.0, two seminars and a Leaders Summit.',
      shapeZh: '十場圍繞工業 4.0 的技術提升工作坊、兩場研討會，以及一場領袖峰會。', // DRAFTED.
      // hkwtia-org-event-tech-to-connect-4-0-series-the-journey-of-industry-4-0-
      // and-future-trends.html, 25 July 2023 — the only page in 577 that
      // contains the token GSP at all: the WTIA "has launched the 'Tech to
      // Connect 4.0' campaign with GSP funding, to promote knowledge and
      // related technological solutions of the 'New Industrialisation'".
      //
      // Written as a scheme in both locales and expanded in neither, because
      // the archive expands it in neither and never names an administering
      // body. Expanding it here would publish a government programme name on
      // this record's own authority — the same shape of error as the audit's
      // CCIDA claim about ASA.
      funder: {kind: 'named', schemeEn: 'GSP', schemeZh: 'GSP'},
      images: [
        {
          // TTC_9.jpg, the edition's own speaker line-up graphic. It also
          // carries the one funder attribution the archive's *text* never
          // gives: "Funding Organisation 創新科技署 Innovation and Technology
          // Commission", beside "Organiser WTIA". See this file's docblock.
          src: '/images/programs/TTC_9.jpg',
          altEn: 'Speaker line-up for the Tech to Connect 4.0 Leaders Summit, 20 April 2023 at HKPC Building, showing thirteen speakers with their companies.',
          altZh: '「智連 4.0」領袖峰會講者陣容，二零二三年四月二十日於生產力大樓舉行，列出十三位講者及其所屬機構。'
        }
      ]
    },
    {
      // The rename lands here. hkwtia-org-event-tech-to-connect-2024-ai-
      // leaders-summit-harnessing-ai-to-drive-global-transformation.html is the
      // English name — "Tech to Connect 2024 AI Leaders' Summit" — and this
      // edition's workshop listings are Chinese, headed 【Tech Connect系列
      // 工作坊#N】. The May 2025 news post titles itself 「Tech Connect 智創互聯」
      // AI 領袖系列研討會 / "Tech Connect" AI Leaders Seminar Series.
      //
      // labelEn carries a year and labelZh does not, because that is how the
      // archive writes them: no Chinese page of this edition ever attaches
      // 2024 to 智創互聯. The 2026 edition below writes both.
      labelEn: 'Tech to Connect 2024',
      labelZh: 'Tech Connect 智創互聯',
      // The edition's own name says 2024 and its first workshop is 2024-08-20,
      // but it runs into July 2025 — the summit itself was held 2025-05-06.
      year: 2024,
      // Composed from the workshop listings' own numbering and the summit's own
      // page. No page states a total, and none is asserted here: the capture
      // holds 【Tech Connect系列工作坊#2】(2024-10-31) through #9 (2025-06-19),
      // an unnumbered "Tech to Connect Workshop – AI-Driven Marketing"
      // (2024-08-20) that would sit at #1, and an unnumbered 「智創互聯：AI 防護
      // 盾 尋找安全之道」(2025-07-14). #1 is inferred and the run may go past
      // #9, so the sentence gives the span and not a count.
      //
      // 「人工智能領袖峰會」 is the summit page's own Chinese for itself
      // (「WTIA 再度舉辦人工智能領袖峰會」); its English title is above. The page
      // gives two different speaker counts and this record repeats neither.
      shapeEn: 'A numbered run of Tech Connect workshops from August 2024 into July 2025, and the AI Leaders\' Summit on 6 May 2025.',
      shapeZh: '2024 年 8 月至 2025 年 7 月期間舉行的「Tech Connect 系列工作坊」，以及 2025 年 5 月 6 日的人工智能領袖峰會。', // DRAFTED.
      // No page of this edition names a funder. The 2025-07-14 workshop's
      // hashtag block ends 「#TechConnect #創新科技署 #UDS #NetworkBox」, which
      // is the only government body named anywhere near this edition — and it
      // is a hashtag on a wrap-up post, not a funding statement. Recording it
      // would attribute government funding on the evidence of a hashtag, which
      // is the error class this whole sub-project exists to prevent. Raised in
      // the task report for WTIA to confirm or deny.
      funder: {kind: 'none-recorded'},
      images: []
    },
    {
      // hkwtia-org-event-…智創互聯-2026…wtia-tech-to-connect.html. Its title is
      // bilingual and is the sentence tctProgramSchema's own comment quotes:
      // 「智創互聯 2026：機器人與自動化賦能啟動研討會 | WTIA Tech To Connect 2026:
      // Robotics & Automation Kick-Off Seminar」. Both halves are transcribed;
      // neither locale is drafted.
      labelEn: 'Tech To Connect 2026',
      labelZh: '智創互聯 2026',
      // The page renders the date as a bare "May 15"; its embedded event data
      // gives "startDate":"2026-05-15T15:00:00+08:00".
      year: 2026,
      // Composed from that page, which is a wrap-up of the kick-off and an
      // announcement of the rest: "WTIA successfully launched the Tech To
      // Connect 2026 flagship series at the Kowloon Tong Innovation Centre" …
      // "Stay tuned — more technology workshops, industry networking events,
      // and flagship programmes are coming your way as part of Tech To Connect
      // 2026!" One event had happened when the site was captured; the sentence
      // says so rather than implying a finished programme.
      shapeEn: 'A Robotics & Automation kick-off seminar on 15 May 2026, with further technology workshops, industry networking events and flagship programmes announced to follow.',
      shapeZh: '2026 年 5 月 15 日的「機器人與自動化賦能啟動研討會」，其後預告將舉行更多技術工作坊、產業對接及旗艦活動。', // DRAFTED.
      // The page names four speakers' companies and no funder.
      funder: {kind: 'none-recorded'},
      images: []
    }
  ]
});
