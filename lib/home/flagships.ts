export const flagshipOrder = ['cpai', 'hkict', 'tct', 'asa', 'insidw'] as const;

export type FlagshipId = (typeof flagshipOrder)[number];

export type FlagshipLink = Readonly<{
  id: FlagshipId;
  primaryHref: string;
  primaryExternal: boolean;
  secondaryHref?: '/programs/hkict' | '/programs/tct';
}>;

/**
 * Home flagship strip (Claire gate 2026-11-06 §2.1). Five cards, in this order.
 *
 * ASA stays internal. Historical contest hosts on bestasiaapp.hk answered 301 to an
 * unrelated domain on 2026-11-06, so they are not CTAs. InsidW has no programme
 * record on Preview, so it has no secondary page. The programmes index keeps the
 * four typed records and the British `programmes` spelling; these detail hrefs
 * stay on `programs/*`.
 */
export const flagships: readonly FlagshipLink[] = [
  {id: 'cpai', primaryHref: '/programs/cpai', primaryExternal: false},
  {
    id: 'hkict',
    primaryHref: 'https://www.ictstartupaward.com/',
    primaryExternal: true,
    secondaryHref: '/programs/hkict',
  },
  {
    id: 'tct',
    primaryHref: 'https://techtoconnect.net/',
    primaryExternal: true,
    secondaryHref: '/programs/tct',
  },
  {id: 'asa', primaryHref: '/programs/asa', primaryExternal: false},
  {id: 'insidw', primaryHref: 'https://insidw.com/', primaryExternal: true},
];
