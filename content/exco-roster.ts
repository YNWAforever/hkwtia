// Executive Committee roster for /about/committees.
//
// Visible names, titles, organisation lines, and biographies live in
// Committees.roster in messages/en.json and messages/zh-HK.json. This module
// is the structural record: order, photos, and zhPending.
//
// Source of record: docs/exco-update-20261113/<slug>.md. Message copy keeps
// each member's wording, including original typos. The only normalisation is
// whitespace: a line break that splits a sentence is joined, and a trailing
// profile URL in larry-lam.md is left out of the page.
//
// Order is provisional: Willy Lai first as Chairman, then the other members
// by surname (Chan, Chau, Cheung, Ha, Kun, Lam, Ma, Mak, Poon, Tse, Yung).
// It is not a confirmed precedence list.
//
// zhPending: no Traditional Chinese bio was supplied. The zh-HK bio strings
// are the English text. Do not machine-translate. Chinese names exist only
// where one was supplied: 賴志偉 (Willy) and 夏羽 (Simon), in messages/zh-HK.json.
// Willy's Chinese title is 主席. Never 會長.
//
// Photos live at public/images/exco/<slug>.jpg. lawrence-cheung uses
// lawrence-cheung.jpg (not lawrence-cheung-alt.jpg). Alex has no photo.

export type ExcoRosterMember = Readonly<{
  slug: string;
  surname: string;
  /** messages Committees.roster.<slug>.title exists. */
  title: boolean;
  /** messages Committees.roster.<slug>.organization exists. */
  organization: boolean;
  /** Null renders an initials placeholder. No stock image and no logo. */
  photo: string | null;
  /** `top` keeps full-body and landscape frames from cropping the face. */
  photoPosition: "center" | "top";
  /**
   * Traditional Chinese bio was not supplied. The zh-HK bio message is English.
   * Do not machine-translate.
   */
  zhPending: true;
}>;

export const excoRoster: readonly ExcoRosterMember[] = [
  {
    "slug": "willy-lai",
    "surname": "Lai",
    "title": true,
    "organization": false,
    "photo": "/images/exco/willy-lai.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "ricky-chan",
    "surname": "Chan",
    "title": true,
    "organization": false,
    "photo": "/images/exco/ricky-chan.jpg",
    "photoPosition": "top",
    "zhPending": true
  },
  {
    "slug": "burton-chau",
    "surname": "Chau",
    "title": true,
    "organization": false,
    "photo": "/images/exco/burton-chau.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "lawrence-cheung",
    "surname": "Cheung",
    "title": true,
    "organization": false,
    "photo": "/images/exco/lawrence-cheung.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "simon-ha",
    "surname": "Ha",
    "title": true,
    "organization": false,
    "photo": "/images/exco/simon-ha.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "alex-kun",
    "surname": "Kun",
    "title": true,
    "organization": true,
    "photo": null,
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "larry-lam",
    "surname": "Lam",
    "title": false,
    "organization": false,
    "photo": "/images/exco/larry-lam.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "antony-ma",
    "surname": "Ma",
    "title": true,
    "organization": false,
    "photo": "/images/exco/antony-ma.jpg",
    "photoPosition": "top",
    "zhPending": true
  },
  {
    "slug": "jess-mak",
    "surname": "Mak",
    "title": true,
    "organization": true,
    "photo": "/images/exco/jess-mak.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "lawrence-poon",
    "surname": "Poon",
    "title": false,
    "organization": false,
    "photo": "/images/exco/lawrence-poon.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "nelson-tse",
    "surname": "Tse",
    "title": true,
    "organization": true,
    "photo": "/images/exco/nelson-tse.jpg",
    "photoPosition": "center",
    "zhPending": true
  },
  {
    "slug": "eric-yung",
    "surname": "Yung",
    "title": true,
    "organization": false,
    "photo": "/images/exco/eric-yung.jpg",
    "photoPosition": "center",
    "zhPending": true
  }
];
