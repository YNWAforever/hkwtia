/**
 * One record for the details the footer, the contact page and (from WP-3) the Organization
 * structured data all print. `phone` is optional and currently unset: the donor prints
 * "+852 2989 9164", but on 2026-09-02 hkwtia.org could not be read to confirm it — the site
 * answers with a bot challenge, which is not something to work around — and no message bundle
 * carries a number. An unverifiable number is omitted rather than repeated; set it here once
 * the association confirms it and the footer renders the tel: line on its own.
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
