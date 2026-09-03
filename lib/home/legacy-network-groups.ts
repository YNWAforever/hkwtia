import 'server-only';

import type {AppLocale} from '@/i18n/routing';
import {partnersRepository, type PartnerProjection} from '@/lib/db/repos/partners';

export type LegacyNetworkCategory = 'supporting' | 'regional' | 'media';
export type LegacyNetworkGroup = Readonly<{category: LegacyNetworkCategory; partners: readonly PartnerProjection[]}>;

const categories: readonly LegacyNetworkCategory[] = ['supporting', 'regional', 'media'];

// The 3-tab donor grammar covers 3 of the 5 partner_category values; programme and sponsor
// partners are out of scope for this display (design-fidelity master table row 12).
export async function loadLegacyNetworkGroups(locale: AppLocale): Promise<readonly LegacyNetworkGroup[]> {
  const partners = await partnersRepository.listPublished(locale, {limit: 100}).catch(() => []);
  return categories.map((category) => ({
    category,
    partners: partners.filter((partner) => partner.category === category),
  }));
}
