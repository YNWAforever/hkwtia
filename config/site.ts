/**
 * One record for the contact details, but not one authority for all of them — read the field
 * notes before adding a consumer.
 *
 * `email` and `phone` are what the footer prints: components/layout/site-footer.tsx renders
 * both from here, and components/layout/footer-newsletter.tsx builds its `mailto:` from
 * `email`. `phone` is optional and currently unset: the donor prints "+852 2989 9164", but on
 * 2026-09-02 hkwtia.org could not be read to confirm it — the site answers with a bot
 * challenge, which is not something to work around — and no message bundle carries a number.
 * An unverifiable number is omitted rather than repeated; set it here once the association
 * confirms it and the footer renders the tel: line on its own. (The contact page still
 * publishes the donor's number of its own accord: errata E-20, owner action in WP-3.)
 *
 * `addressLines` is NOT what the footer prints. The footer reads `Footer.addressLines` from
 * the message bundle, because the address is genuinely different per locale rather than a
 * translation of one list: English is three lines ("4/F, KOHO" / "73-75 Hung To Road" /
 * "Kwun Tong, Hong Kong") and Chinese is two, in Chinese address order. This list is the
 * English machine-readable record kept for WP-3's Organization structured data, and it has no
 * product consumer today. tests/unit/site-footer.test.tsx pins the rendered address against
 * each bundle and pins this list against the English bundle, so the two cannot drift apart
 * without a named failure; before this branch the only assertion looked like a config-to-UI
 * pin and passed solely because the two happened to agree (errata E-68).
 */
type SiteContact = Readonly<{
  email: string;
  phone?: string;
  addressLines: readonly string[];
}>;

export const siteContact: SiteContact = {
  email: 'contact@hkwtia.org',
  addressLines: ['4/F, KOHO', '73-75 Hung To Road', 'Kwun Tong, Hong Kong']
};

export const siteConfig = {
  name: 'Hong Kong Wireless Technology Industry Association',
  shortName: 'WTIA',
  defaultDescription:
    'Connecting Hong Kong\'s wireless technology community through collaboration, innovation and industry development.',
  defaultImage: '/images/wtia-logo.png',
  contact: siteContact
} as const;
