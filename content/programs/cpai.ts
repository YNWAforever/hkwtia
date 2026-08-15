import {cpaiProgramSchema, type CpaiProgram} from '@/content/schemas';

/**
 * Transcribed from the captured archive, not from
 * docs/wtia-content-migration-audit.md, which calls CPAI a "joint WTIA × CUSCS
 * certification" and a "certified course". It is neither: WTIA issues CPAI
 * alone, CUSCS separately issues its own completion certificate to the same
 * graduates, and CPAI is the credential rather than the course.
 * docs/wtia-programme-claims-review.md §2 records what the archive says.
 *
 * Three pages hold everything below, and each field names its own:
 *
 * - `hkwtia-org-certified-courses.html` — the CPAI landing page, and the source
 *   of the credential prose in both locales. Its slug never says "CPAI", which
 *   is why the surveys and the migration's first page classifier both missed
 *   it; the claims review's own postscript records that.
 * - `hkwtia-org-event-…cpai-…認證.html` — the 2 March 2026 course listing
 *   (「中大 CUSCS / WTIAI 合辦 GenAI 商業應用課程：CPAI 專業認證」), and the only
 *   page in 577 that states the two-certificate arrangement or the syllabus.
 * - `hkwtia-org-event-graduation-ceremony-…-cpai-program.html` — 27 May 2025.
 *   Its article region carries a date, a venue and nothing else; no prose, no
 *   graduate names, no cohort size. It contributes no field here.
 *
 * Values drafted rather than transcribed, each marked `DRAFTED` where it
 * appears:
 *
 * 1. `syllabus[].titleEn` — all four. The course listing is Chinese-only and
 *    names 「四大模組」; the English is written here rather than a module being
 *    dropped for want of one, since `titleEn` is required. The Chinese half of
 *    each is transcribed verbatim, so a reader of /zh sees WTIA's own words and
 *    only the English is this file's. The four are the page's four; there is no
 *    fifth, and each carries the page's own gloss in the comment above it.
 * 2. `courseNameZh` — 「生成式AI商業創新與應用」. The landing page writes
 *    「生成式AI商業創新與應用專業認證 (CPAI)」, which is the *credential's*
 *    Chinese name; the course title alone is that string minus 專業認證, and no
 *    page writes it standing on its own.
 * 3. `partnerCertificateEn` — "CUSCS Certificate of Completion". The only page
 *    that names this certificate is Chinese: 「完成課程後同時獲頒 School of
 *    Continuing and Professional Studies, CUHK (CUSCS) 結業證書」. 結業證書 has
 *    no English form anywhere in the capture.
 *
 * `courseNameEn` is not drafted but is assembled rather than quoted: the string
 * "Generative AI for Business Innovation and Applications" is the tail of the
 * credential's own name on the landing page, and is also the slug of the CUSCS
 * enrolment page the landing page's "Apply Now" button links to
 * (`scs.cuhk.edu.hk/tc/part-time/data-science/generative-ai-for-business-
 * innovation-and-applications-ai/252-191120-01`). No page writes "the course is
 * called …". See the task report.
 *
 * Two things the archive states that are deliberately not here:
 *
 * - **"Over 150 pioneering companies".** The landing page asserts it in both
 *   locales — "recognized by over 150 pioneering companies in the Innovation
 *   and Technology Industry" / 「獲得超過150家創新與科技行業先驅公司的認可」 —
 *   and nothing anywhere substantiates it: no list, no logos, no named
 *   employer. It is claims review §2's open question to WTIA, and it stays off
 *   the page until they answer. cpaiProgramSchema is `.strict()` and has no
 *   field for it, so this is a note rather than a temptation.
 * - **The course schedule.** Not for want of material: the course listing gives
 *   a start date (「日期：2026年3月2日起（逢週一晚）」), a 19:00–22:00 slot
 *   totalling 「共 12 小時」, a venue (中環教學中心), an enrolment deadline
 *   (2026年2月23日) and 「已成功舉辦兩屆，第三屆現正接受最後報名」. The landing
 *   page's own course card disagrees with the start date — 「【NITTP資助】WTIA x
 *   CUSCS | GenAI 12小時雙證書課程 | 3月12日正式開班」 says 3月12日 against the
 *   listing's 3月2日 — which is one more reason not to publish a schedule from
 *   this archive. cpaiProgramSchema has no field for
 *   any of it on purpose — see its comment. A credential page framed as a
 *   course schedule is the framing the claims review warns against, and
 *   enrolment happens on CUSCS systems rather than here.
 *
 * Also absent because the archive does not contain them: fee, assessment
 * requirements, validity period and prerequisites. The landing page's course
 * card is headed 「【NITTP資助】…」, which is the only funding word attached to
 * CPAI anywhere; the acronym is never expanded and there is no funder field.
 */
export const cpai: CpaiProgram = cpaiProgramSchema.parse({
  id: 'cpai',
  // The course listing, verbatim: 「CPAI（Certified Practitioner in GenAI）
  // 由 WTIA 頒發，是專為商業環境而設的生成式 AI 專業認證。」 Issued by WTIA, and
  // by WTIA alone. The landing page says the same in English — "The … (CPAI)
  // credential recognizes individuals who have successfully completed the
  // comprehensive course" — and names no co-issuer either.
  //
  // issuerZh is "WTIA" and not 「香港無線科技商會」 because the sentence above is
  // the Chinese page's own, and it writes the association in Latin script. The
  // same call content/programs/hkict.ts makes for Entoptica's nameZh.
  issuerEn: 'WTIA',
  issuerZh: 'WTIA',
  // Written in Latin script inside that same Chinese sentence: 「完成課程後同時
  // 獲頒 School of Continuing and Professional Studies, CUHK (CUSCS) 結業證書」.
  // CUSCS teaches the course; it does not co-issue CPAI.
  coursePartnerEn: 'School of Continuing and Professional Studies, CUHK (CUSCS)',
  // The course listing's own title: 「中大 CUSCS / WTIAI 合辦 GenAI 商業應用
  // 課程：CPAI 專業認證」. 「香港中文大學專業進修學院」 appears in none of the 577
  // pages (`grep 專業進修` returns nothing), so this abbreviation is the only
  // Chinese form the archive has, and inventing the full name is not this
  // file's job.
  coursePartnerZh: '中大 CUSCS',
  // See the header: the tail of the credential's own name on the landing page,
  // and the slug of the CUSCS enrolment page it links to.
  courseNameEn: 'Generative AI for Business Innovation and Applications',
  // DRAFTED: split out of the landing page's 「生成式AI商業創新與應用專業認證
  // (CPAI)」, which names the credential rather than the course.
  courseNameZh: '生成式AI商業創新與應用',
  // The other half of 「一個課程，兩張認證。」 — the second certificate, issued by
  // CUSCS, not by WTIA and not jointly. Without this the record states only
  // half the correction the claims review asks for.
  partnerCertificateEn: 'CUSCS Certificate of Completion', // DRAFTED: 結業證書 has no English form in the capture.
  partnerCertificateZh: 'CUSCS 結業證書',
  // 「12 小時實戰課程，涵蓋四大模組：」 and then exactly these four, in this
  // order. Each Chinese title is the page's text up to its em dash; the gloss
  // that follows the dash is quoted in the comment rather than folded into the
  // title, because the schema's syllabus entry is a title pair and nothing
  // else. All four titleEn values are this file's English, not WTIA's.
  syllabus: [
    {
      // 「企業 AI 應用的策略框架 — 識別機遇、評估可行性、制定落地方案」
      titleEn: 'Strategic frameworks for enterprise AI adoption', // DRAFTED: page is Chinese-only.
      titleZh: '企業 AI 應用的策略框架'
    },
    {
      // 「生成式 AI 內容創作實操 — 即場使用工具處理真實商業場景」
      titleEn: 'Hands-on generative AI content creation', // DRAFTED: page is Chinese-only.
      titleZh: '生成式 AI 內容創作實操'
    },
    {
      // 「AI 時代的網絡安全與合規要點 — 確保方案經得起審視」
      titleEn: 'Cybersecurity and compliance essentials for the AI era', // DRAFTED: page is Chinese-only.
      titleZh: 'AI 時代的網絡安全與合規要點'
    },
    {
      // 「垂直行業 AI 應用案例 — 不同行業的最佳落地實踐」
      titleEn: 'AI case studies across vertical industries', // DRAFTED: page is Chinese-only.
      titleZh: '垂直行業 AI 應用案例'
    }
  ],
  images: [
    {
      // CPAI-Certificate-F.jpg, from the landing page: the certificate
      // template itself. It names WTIA alone as issuer, signed by WTIA's
      // Chairman and Honorary Chairman, with no CUSCS mark anywhere -- which
      // is the correction this record exists to make, in WTIA's own artwork.
      src: '/images/programs/CPAI-Certificate-F.jpg',
      altEn: 'The CPAI certificate template, headed WTIA and signed by WTIA\'s Chairman and Honorary Chairman.',
      altZh: 'CPAI 證書範本，以商會為抬頭，由商會主席及榮譽主席簽署。'
    }
  ]
});
