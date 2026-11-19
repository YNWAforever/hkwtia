import {cpaiProgramSchema, type CpaiProgram} from '@/content/schemas';

/**
 * CPAI programme record. The page reads the course name, the completion
 * certificate sentence, and the archive syllabus. It does not read an issuer.
 *
 * No current approved wording establishes who issues CPAI or who the course
 * is for, so those fields are absent rather than filled with a guess. The
 * certificate sentence is a draft application condition: at least 70%
 * attendance and a pass on the assignment. It is not an automatic award and
 * it is not the CPAI credential. Do not add a partner promotional paragraph
 * here. Using the other party's name in promotion still needs that party's
 * approval, and a delivery label would be read as a claim that the partner
 * teaches the course.
 *
 * The certificate template image is not in this record. A depiction is not
 * verification of the current issuer.
 *
 * Syllabus English titles are drafted. The course listing is Chinese-only and
 * names 「四大模組」; the Chinese half of each entry is transcribed verbatim.
 * These four modules are that archive listing, not a statement of the next
 * intake. Do not add a fifth, and do not treat a new topic list as a
 * substitute for the missing issuer.
 *
 * `courseNameEn` is the tail of the credential name on the old landing page,
 * which is also the slug of the enrolment page that page linked to.
 * `courseNameZh` drops 「專業認證」 from that page's credential name. The July
 * outline writes the course title the same way. Neither string names an issuer.
 *
 * Still absent on purpose:
 *
 * - The "over 150 pioneering companies" figure. Nothing substantiates it, and
 *   the schema has no field for it.
 * - Dates, venue, fee, duration, and enrolment deadlines. The archive pages
 *   disagree on the March 2026 start date, and a schedule here would read as
 *   the next intake.
 */
export const cpai: CpaiProgram = cpaiProgramSchema.parse({
  id: 'cpai',
  // Stored, not rendered. The public role wording is unapproved.
  coursePartnerEn: 'School of Continuing and Professional Studies, CUHK (CUSCS)',
  // The course listing's own short form. The full Chinese school name is not
  // in the archive, so it is not invented here.
  coursePartnerZh: '中大 CUSCS',
  courseNameEn: 'Generative AI for Business Innovation and Applications',
  courseNameZh: '生成式AI商業創新與應用',
  // Draft sentence for this correction, not a publishing approval.
  partnerCertificateEn: 'Participants with an attendance rate of at least 70% who pass the assignment can apply for a Certificate of Completion.',
  partnerCertificateZh: '出席率達至少 70%，並且功課合格的學員，可申請結業證書。',
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
  // Empty on purpose. The template file is kept at
  // content/cpai-certificate-withheld/ so it is not a public URL. A depiction
  // is not current issuer verification, and the old alt text stated an issuer
  // the record does not claim.
  images: []
});
