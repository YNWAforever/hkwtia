import type {PartnerProjection} from '@/lib/db/repos/partners';

export type PartnerCategory = PartnerProjection['category'];
export type PublishedPartnerGroup = Readonly<{category: PartnerCategory; partners: readonly PartnerProjection[]}>;

// The donor's three tabs cover three of the five partner_category values; /partners shows all five
// in this fixed order, and omits a category with nothing published rather than showing a zero.
export const partnerCategoryOrder: readonly PartnerCategory[] = ['supporting', 'regional', 'media', 'programme', 'sponsor'];

export function groupPublishedPartners(partners: readonly PartnerProjection[]): readonly PublishedPartnerGroup[] {
  return partnerCategoryOrder
    .map((category) => ({category, partners: partners.filter((partner) => partner.category === category)}))
    .filter((group) => group.partners.length > 0);
}
