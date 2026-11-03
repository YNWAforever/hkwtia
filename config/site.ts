/**
 * One record for the contact details, but not one authority for all of them — read the field
 * notes before adding a consumer.
 *
 * `email` and `phone` are what the footer prints: components/layout/site-footer.tsx renders
 * both from here, and components/layout/footer-newsletter.tsx builds its `mailto:` from
 * `email`. `phone` is optional: as of 2026-09-02 it was left unset, because the donor prints
 * "+852 2989 9164" but hkwtia.org could not be read that day to confirm it — the site answered
 * with a bot challenge, which was not something to work around — and no message bundle carried
 * a number. An unverifiable number was omitted rather than repeated.
 *
 * On 2026-09-03 the product owner confirmed `+852 2989 9164` (errata E-20's owner action).
 * Claire's gate on 2026-11-03 put both the phone and the KOHO address back to 待核實.
 * `phone` is unset and `addressLines` is empty until that confirmation. The footer and
 * contact page already skip a missing phone. Do not fill either from this file.
 *
 * `addressLines` is the English machine-readable record for Organization structured data.
 * It is empty while the postal address is unconfirmed, and structured data omits `address`
 * in that case. The footer reads `Footer.addressLines`, which is also empty.
 */
type SiteContact = Readonly<{
  email: string;
  phone?: string;
  whatsapp?: string;
  addressLines: readonly string[];
}>;

export const siteContact: SiteContact = {
  email: 'contact@hkwtia.org',
  // Claire gate 2026-11-03: address and phone stay unpublished until confirmed.
  // Do not restore +852 2989 9164 or 4/F KOHO from memory. Email only.
  phone: undefined,
  // WhatsApp Business number for click-to-chat (programme §8). Unset until the
  // Woztell channel is provisioned; every WhatsAppLink renders nothing until then.
  // When it exists, set it as '+852 XXXX XXXX'; clickToChatUrl strips formatting.
  whatsapp: undefined,
  addressLines: []
};

export const siteConfig = {
  name: 'Hong Kong Wireless Technology Industry Association',
  shortName: 'WTIA',
  // Willy Approve t341s1501 (Phase 0): every public <title> is
  // "{Page}｜Hong Kong Wireless Technology Industry Association (WTIA)" in English and
  // "{頁名}｜香港無線科技商會 WTIA" in zh-HK. Fullwidth bar in both locales.
  // `publicBrand` / `shortName` stay WTIA and still feed openGraph.siteName.
  // This is not an Option D / WISE rename and does not change BRAND.md D4.
  publicBrand: 'WTIA',
  titleSuffix: {
    en: 'Hong Kong Wireless Technology Industry Association (WTIA)',
    'zh-HK': '香港無線科技商會 WTIA',
  },
  defaultDescription:
    'Connecting Hong Kong\'s wireless technology community through collaboration, innovation and industry development.',
  defaultImage: '/images/wtia-logo.png',
  contact: siteContact
} as const;
