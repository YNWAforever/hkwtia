import {hkictProgramSchema, type HkictProgram} from '@/content/schemas';

/**
 * Transcribed from the captured archive, not from
 * docs/wtia-content-migration-audit.md, which says this programme is "organised
 * for the Digital Policy Office" as though that held throughout. It does not:
 * DPO appears only in 2025. docs/wtia-programme-claims-review.md §3 records what
 * the archive actually says.
 *
 * Every counterparty and winner name below was read off a captured page; the
 * page is named in the comment beside it. Values drafted rather than
 * transcribed are marked `DRAFTED` where they appear:
 *
 * 1. `categoryEn` on all thirteen 2023 winners — the ICTA23 ceremony page's
 *    winner list is Chinese-only, so the Chinese category is repeated into the
 *    English field rather than an English award name being invented. The
 *    archive gives no English form of these three category names anywhere: the
 *    2020 post describes the fields as "software, hardware and social
 *    innovation areas" in passing, which is a description and not a category
 *    name, and the home page's three 2026 streams are different names for a
 *    restructured edition.
 * 2. `nameZh` on the five 2023 winners the page writes in English only (CHOMP
 *    Limited, Vidi Labs Limited, Llewellyn and Partners Company Limited, V SING
 *    HONG KONG LIMITED, Liquid Tech) — the other eight are written as an
 *    English name followed by its Chinese name and are split as written.
 *    Repeating the English name is what winnerSchema's own comment calls the
 *    intended answer for a company with no Chinese form.
 * 3. `nameZh` on the 2025 winner — the Chinese half of that bilingual post
 *    writes "Entoptica Limited" in Latin script too.
 *
 * Three transcription decisions worth stating plainly:
 *
 * - The 2023 category strings join the page's section heading to its award tier
 *   with an em dash ("資訊科技初創企業（硬件與設備）獎 — 金獎"), the same join
 *   content/programs/asa.ts uses for ASA 2024. Everything either side of the
 *   dash is the page's own text.
 * - 「#GrandAward」 is kept in the 2023 grand award's category. It is a hashtag
 *   the author appended to the section heading, and the heading is transcribed
 *   as written rather than tidied — the same rule that kept ASA 2024's "Sliver
 *   Award" typo visible.
 * - The 2023 社會貢獻 category awards 金獎, 銀獎, 銀獎 and 優異證書: two Silver
 *   awards and no Bronze, where the other two categories run Gold/Silver/Bronze.
 *   It reads like a typo for 銅獎 on the second one, but the page says 銀獎, so
 *   the record says 銀獎. tests/unit/program-content.test.ts pins it so that a
 *   later editor "fixing" it has to argue with a test. See the task report.
 *
 * Nothing here describes what a winner built. The 2025 post does say Entoptica
 * won 「憑藉其創新技術 SLOPE device」, but winnerSchema is `.strict()` and has no
 * field for a product, deliberately — see its comment. The fact is recorded in
 * the comment beside that entry and nowhere else.
 *
 * Two things the archive shows that this record cannot hold:
 *
 * - A **2026 edition**. The home page's HKICT card describes "Hong Kong ICT
 *   Startup Award 2026" across three named streams, with prizes. It names no
 *   government counterparty, and `organisedFor` is a required enum, so the only
 *   way to record 2026 would be to carry DPO forward from 2025 by assumption.
 *   That is the exact shape of the error this file exists to prevent, so the
 *   edition is left off until WTIA states its counterparty.
 * - **`year` is the only date field.** A dedicated edition page exists for 2020,
 *   2023, 2024 and 2025 only; 2021 and 2022 are attested by other pages, noted
 *   on each.
 */
export const hkict: HkictProgram = hkictProgramSchema.parse({
  id: 'hkict',
  editions: [
    {
      // hkwtia-org-2020-01-2020-hong-kong-ict-awards-ict-startup-award.html —
      // the edition's own post, and the first edition of the Startup Award
      // stream. The 2006 Best Ubiquitous Award and the 2013–2017 Best Mobile
      // Apps Award pages are a different stream and are deliberately absent;
      // hkictProgramSchema's `year` floor of 2020 enforces that.
      year: 2020,
      // Same page, first sentence: "Supported by Office of the Government Chief
      // Information Officer (OGCIO) and organized by WTIA". Named outright, in
      // English, on the edition's own page — the only edition of which that is
      // true.
      organisedFor: 'ogcio',
      // No captured page publishes a 2020 winner list. Two pages name one
      // winner between them, and neither is a results announcement:
      //
      // - hkwtia-org-event-…-ict-startup-award-launch-party-x-sharing-section
      //   .html (June 2021) introduces a panellist as "Mr. Davon Hui, Founder
      //   and CEO, blutech.io (Award of the Year of HKICT Awards 2020 and ICT
      //   Startup Award Grand Award Winner)".
      // - hkwtia-org-media-coverage-press-release.html reproduces a third-party
      //   headline dated 19/11/2020: 「2020 ICT Startup Award」結果揭曉 Blutech
      //   IoT Ltd. 奪初創企業大獎及初創企業(硬件與設備)金獎成大贏家 !
      //
      // That is one winner named as a returning panellist plus a press clipping
      // WTIA merely indexed, spelling the company three different ways across
      // the capture ("blutech.io", "Blutech IoT Ltd.", "Blutech.io" on the 2025
      // recruitment page). `listed` would assert a completeness a single grand
      // award does not have — the same call content/programs/asa.ts makes for
      // ASA 2020 and 2021.
      //
      // `off-site` was considered and rejected twice. The postponement post
      // writes a bare url — "Latest information of ICT Startup Award can be
      // viewed at : https://www.ictstartup.org/" — but "latest information" is
      // not a winner list. The 2020-12-04 【Awards Presentation Ceremony】page
      // carries "Website: https://www.hkictawards.hk/award_en.php?year=2020" in
      // its meta box and says nothing about what is there; a bare `Website:`
      // field is the same evidence asa.ts refused for ASA 2021.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // No edition post exists for 2021. The edition is attested by
      // hkwtia-org-event-…-ict-startup-award-launch-party-x-sharing-section
      // .html: "WTIA is organising a launch party and sharing section for the
      // 2021 ICT Startup Award", 9 June 2021. hkwtia-org-photo-gallery.html
      // also carries a "Hong Kong ICT Awards 2021 / Awards Presentation
      // Ceremony" album.
      year: 2021,
      // Not on that page, which names no government body at all. Taken from the
      // ICTA23 ceremony page's own sentence: 「感謝政府資訊科技總監辦公室過去 4
      // 年對 WTIA 的信任」 — WTIA thanking OGCIO for the past four years, which
      // from a November 2023 ceremony covers 2020, 2021, 2022 and 2023. That
      // sentence is this record's only source for 2021 and 2022.
      organisedFor: 'ogcio',
      // Per docs/wtia-programme-claims-review.md, and verified here: the only
      // 2021 trace is the photo-gallery album above, which is a lightbox of
      // untitled images inside the single /photo-gallery/ page. It names nobody
      // and has no per-album url, so there is no `off-site` url to write either.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // The thinnest edition in this record, and the comment says so rather
      // than hiding it. No 2022 page exists in the capture — not an edition
      // post, not an event listing. Two things attest it:
      // hkwtia-org-photo-gallery.html carries "Hong Kong ICT Awards 2022 /
      // Introductory Party" and "Hong Kong ICT Awards 2022 / Award Presentation
      // Ceremony" albums, and the ICTA23 「過去 4 年」 sentence below counts 2022
      // among WTIA's four years with OGCIO. Both album titles say "Hong Kong
      // ICT Awards", the umbrella award, not "ICT Startup Award" — WTIA
      // organises the Startup Award stream within it, which is why they are
      // WTIA's own photos, but the page does not say so in as many words.
      year: 2022,
      // Same 「過去 4 年」 sentence on the ICTA23 ceremony page. See 2021.
      organisedFor: 'ogcio',
      // The 2023 recruitment seminar page runs a "Meet the Winners" slot with
      // Raymond Mak (Farmacy HK) and Kelvin Chu (Vista Innotech Limited). It
      // never says which edition they won, or in which category, so neither
      // name is recorded against this or any year.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // hkwtia-org-event-icta23-awards-presentation-ceremony-cum-dinner.html,
      // the 3 November 2023 ceremony. The slug says "icta23" and never says
      // "startup award", so a filename search for this programme does not find
      // it; its body is nonetheless the only complete winner list in the
      // capture for any edition of this award.
      year: 2023,
      // Same page: 「感謝政府資訊科技總監辦公室過去 4 年對 WTIA 的信任」.
      organisedFor: 'ogcio',
      // Transcribed from that page's own prose block, not from the six photos
      // above it, which carry no captions. The list below is the page's, in the
      // page's order, ending where the page ends — "優異證書 – Liquid Tech",
      // with no "Limited", is how the paragraph closes.
      winners: {
        kind: 'listed',
        entries: [
          {
            nameEn: 'LaSense Technology Limited',
            nameZh: '朗思科技有限公司',
            // DRAFTED: winner list is Chinese-only; Chinese repeated.
            categoryEn: '資訊科技初創企業大獎 #GrandAward',
            categoryZh: '資訊科技初創企業大獎 #GrandAward'
          },
          {
            // The grand award winner again, taking Gold in its own category.
            nameEn: 'LaSense Technology Limited',
            nameZh: '朗思科技有限公司',
            categoryEn: '資訊科技初創企業（硬件與設備）獎 — 金獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（硬件與設備）獎 — 金獎'
          },
          {
            // Upper-case as the page writes it; the other entries are not.
            nameEn: 'APICEM TECHNOLOGY SERVICES COMPANY LIMITED',
            nameZh: '智耘科技服務有限公司',
            categoryEn: '資訊科技初創企業（硬件與設備）獎 — 銀獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（硬件與設備）獎 — 銀獎'
          },
          {
            nameEn: 'Hong Kong Well Life Biotechnology Limited',
            nameZh: '偉發（香港）生物科技有限公司',
            categoryEn: '資訊科技初創企業（硬件與設備）獎 — 銅獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（硬件與設備）獎 — 銅獎'
          },
          {
            nameEn: 'Libpet Tech Limited',
            nameZh: '途齡科技有限公司',
            categoryEn: '資訊科技初創企業（硬件與設備）獎 — 優異證書', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（硬件與設備）獎 — 優異證書'
          },
          {
            nameEn: 'PanopticAI Limited',
            nameZh: '全境智能有限公司',
            categoryEn: '資訊科技初創企業（社會貢獻）獎 — 金獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（社會貢獻）獎 — 金獎'
          },
          {
            nameEn: 'CHOMP Limited',
            nameZh: 'CHOMP Limited', // DRAFTED: page gives no Chinese name.
            categoryEn: '資訊科技初創企業（社會貢獻）獎 — 銀獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（社會貢獻）獎 — 銀獎'
          },
          {
            // The page's second 銀獎 in this category, where the other two
            // categories award 金/銀/銅. Kept as written; see the header.
            nameEn: 'Vidi Labs Limited',
            nameZh: 'Vidi Labs Limited', // DRAFTED: page gives no Chinese name.
            categoryEn: '資訊科技初創企業（社會貢獻）獎 — 銀獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（社會貢獻）獎 — 銀獎'
          },
          {
            nameEn: 'Hong Kong Univisual Intelligent Technology Limited',
            nameZh: '獨聚慧眼科技有限公司',
            categoryEn: '資訊科技初創企業（社會貢獻）獎 — 優異證書', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（社會貢獻）獎 — 優異證書'
          },
          {
            nameEn: 'TalentLabs Limited',
            nameZh: '橋見科技有限公司',
            categoryEn: '資訊科技初創企業（軟件及應用程式）獎 — 金獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（軟件及應用程式）獎 — 金獎'
          },
          {
            nameEn: 'Llewellyn and Partners Company Limited',
            nameZh: 'Llewellyn and Partners Company Limited', // DRAFTED: no Chinese name.
            categoryEn: '資訊科技初創企業（軟件及應用程式）獎 — 銀獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（軟件及應用程式）獎 — 銀獎'
          },
          {
            nameEn: 'V SING HONG KONG LIMITED',
            nameZh: 'V SING HONG KONG LIMITED', // DRAFTED: page gives no Chinese name.
            categoryEn: '資訊科技初創企業（軟件及應用程式）獎 — 銅獎', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（軟件及應用程式）獎 — 銅獎'
          },
          {
            // The page's last line, and it stops here — no "Limited", no
            // Chinese name, nothing after it. Do not complete this name.
            nameEn: 'Liquid Tech',
            nameZh: 'Liquid Tech', // DRAFTED: page gives no Chinese name.
            categoryEn: '資訊科技初創企業（軟件及應用程式）獎 — 優異證書', // DRAFTED: Chinese repeated.
            categoryZh: '資訊科技初創企業（軟件及應用程式）獎 — 優異證書'
          }
        ]
      },
      images: []
    },
    {
      // hkwtia-org-event-…「2024 資訊科技初創企業獎」招募日.html, the 13 June
      // 2024 recruitment day. The only 2024 page in the capture.
      year: 2024,
      // The page names no office, only an officer: 「主禮嘉賓： 香港特別行政區政府
      // 副政府資訊科技總監 黃敬文先生 (Mr. Kingsley WONG)」 — Deputy Government
      // Chief Information Officer, an OGCIO title, in June 2024. This is the
      // event docs/wtia-programme-claims-review.md §3 cites for holding the
      // boundary at 2025: the rename to DPO happened around this time, and the
      // temptation is to move the boundary back on that general knowledge. The
      // page is what decides it, and the page says OGCIO's title.
      organisedFor: 'ogcio',
      // Per the claims review, and verified: no 2024 page names a winner, and
      // hkwtia-org-photo-gallery.html has no 2024 HKICT album at all — its 2024
      // albums are all Asia Smart App Awards. The recruitment page's meta box
      // carries "Website: https://www.ictstartupaward.com/", the award's own
      // microsite, which is a programme site rather than a winner list and was
      // not captured; `off-site` would point a "2024 winners" link at a page
      // nothing in the archive says holds them.
      winners: {kind: 'unrecorded'},
      images: []
    },
    {
      // hkwtia-org-2025-10-…資訊科技初創企業獎.html, the edition's own results
      // post and the only bilingual page in this programme's set.
      year: 2025,
      // Both halves of that post say it: 「由數字政策辦公室主辦、香港無線科技商會
      // （WTIA）籌辦」 and "Steered by the Digital Policy Office and organized by
      // the Hong Kong Wireless Technology Industry Association (WTIA)". The
      // 2025-05-29 recruitment day page says 「由數字政策辦公室舉辦」 too. This is
      // the first and only DPO edition in the capture.
      //
      // The 2025-11-21 ceremony page contradicts all of that in passing: 「有幸
      // 連續六年獲得香港特區政府數字政策辦公室支持」 — six consecutive years of DPO
      // support, which back-dates DPO to 2020 and disagrees with the ICTA23
      // page's own 「政府資訊科技總監辦公室過去 4 年」. Each edition takes its
      // counterparty from its own page, which is why that sentence changes
      // nothing above it. See the task report.
      organisedFor: 'dpo',
      // The post names one winner, and it is the edition's own announcement of
      // its own result — the same footing as ASA 2025 in
      // content/programs/asa.ts, and unlike 2020's panellist bio. Both halves
      // name the same company and the same category, so both locales are
      // transcribed rather than drafted.
      //
      // No other winner is named: the post stops after the grand award, and the
      // ceremony page defers to the umbrella award's site — 「2025 HKICT Awards
      // 得獎名單：https://www.hkictawards.hk/」. That url is written bare and is
      // explicitly called a winner list, so it would qualify as `off-site`; it
      // is not used because it covers all eight HKICT Awards streams rather
      // than this one, and because a transcribed name beats a link. It belongs
      // in the task report as WTIA's to confirm.
      winners: {
        kind: 'listed',
        entries: [
          {
            // 「由 Entoptica Limited 憑藉其創新技術 SLOPE device 奪得」 / "was
            // presented to Entoptica Limited for their groundbreaking SLOPE
            // device". The SLOPE device is the product, and winnerSchema has no
            // field for one on purpose, so it lives in this comment only.
            nameEn: 'Entoptica Limited',
            nameZh: 'Entoptica Limited', // DRAFTED: the Chinese half writes it in Latin script too.
            // English half: "ICT Startup Grand Award". Chinese half:
            // 「資訊科技初創企業大獎」. Both transcribed, neither drafted.
            categoryEn: 'ICT Startup Grand Award',
            categoryZh: '資訊科技初創企業大獎'
          }
        ]
      },
      images: []
    }
  ]
});
