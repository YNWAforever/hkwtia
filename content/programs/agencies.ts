/**
 * The government bodies named across the programme record, in both locales.
 *
 * Written once because these are the highest-consequence proper nouns on these
 * pages: publishing the wrong agency as a funder is specific, checkable, and
 * the kind of statement a trade association gets held to. Two of the four are
 * the same policy area before and after a rename, which is exactly the pair a
 * copy-paste would blur.
 *
 * There is deliberately no `gsp` entry. TCT's archive names GSP as a funding
 * scheme, once, without expanding the acronym or naming the body that
 * administers it -- so it is not an agency and `tctProgramSchema` does not
 * model it as one. Adding it here would invite rendering "Funded by GSP", or
 * worse, expanding it to a government programme name the archive never states.
 */
export const AGENCIES = {
  // Create Hong Kong. Funds ASA 2017 through 2022/23 under CreateSmart.
  createhk: {nameEn: 'Create Hong Kong', nameZh: '創意香港'},
  // Cultural and Creative Industries Development Agency. ASA from 2024 onward.
  // Whether the CreateHK -> CCIDA change is a rename or a transfer between
  // bodies is an open question for WTIA; until they answer, each edition names
  // the body its own archive page names and the pages assert no relationship.
  ccida: {
    nameEn: 'Cultural and Creative Industries Development Agency',
    nameZh: '文創產業發展處'
  },
  // Office of the Government Chief Information Officer. HKICT 2020-2024.
  ogcio: {
    nameEn: 'Office of the Government Chief Information Officer',
    nameZh: '政府資訊科技總監辦公室'
  },
  // Digital Policy Office. HKICT from 2025 only -- a June 2024 recruitment
  // event still bills its guest of honour under the OGCIO title.
  dpo: {nameEn: 'Digital Policy Office', nameZh: '數字政策辦公室'}
} as const;

export type AgencyId = keyof typeof AGENCIES;
