// Executive Committee roster for /about/committees.
//
// Visible names, titles, organisation lines, WTIA role labels, and biographies
// live in Committees.roster in messages/en.json and messages/zh-HK.json. This
// module is the structural record: order, photos, and zhPending.
//
// Source of record for the twelve supplied bios: docs/exco-update-20261113/<slug>.md.
// Message copy keeps each member's wording. The only wording changes are three
// owner-approved typo fixes (Principal, "for Research", Hoplite Technology Limited)
// plus whitespace: a line break that splits a sentence is joined. Larry Lam's
// card links to the canonical profile URL without the source query string.
//
// Order: Willy Lai first, then surname A–Z, and given name A–Z when the surname
// matches (Donald Chan, Jimmy Chan, Ricky CHAN). Provisional, not a precedence list.
//
// Donald Chan and Jimmy Chan are name-only placeholders. Their surname Chan comes
// from existing WTIA Drive records (exco-tree / consent notes). The update folder
// only has "Donald" and "Jimmy-Chan.jpeg"; neither photo nor any other-folder bio
// is used, and 陳甘泉 is not displayed.
//
// zhPending: no Traditional Chinese bio was supplied. zh-HK bio strings are the
// English text. Do not machine-translate. Chinese names exist only where one was
// supplied: 賴志偉 (Willy) and 夏羽 (Simon). Willy's Chinese title is 主席.
// Never 會長. WTIA role labels stay in English on zh-HK until an approved pack.
//
// Locked zh-HK role words, recorded only — not displayed on the site:
// Vice Chairman = 副主席
// Treasurer = 司庫
// Legal Advisor = 法律顧問
// ExCo Member = 執行委員會委員
// Nelson's displayed English role is "Treasurer & Executive Committee Member".
// His later zh-HK role line, not displayed yet, must be 司庫及執行委員會委員.
// Chairman remains 主席, never 會長.
//
// Photos live at public/images/exco/<slug>.jpg. lawrence-cheung uses
// lawrence-cheung.jpg (not lawrence-cheung-alt.jpg). Alex, Donald, and Jimmy
// have no photo.

export type ExcoRosterMember = Readonly<{
  slug: string;
  surname: string;
  /** messages Committees.roster.<slug>.wtiaRole exists. English label on both locales. */
  wtiaRole: boolean;
  /** messages Committees.roster.<slug>.title exists. */
  title: boolean;
  /** messages Committees.roster.<slug>.organization exists. */
  organization: boolean;
  /** messages Committees.roster.<slug>.bio exists. False renders the empty-biography label. */
  bio: boolean;
  /** messages Committees.roster.<slug>.linkedIn exists. Only Larry Lam. */
  linkedIn?: boolean;
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
  {slug: "willy-lai", surname: "Lai", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/willy-lai.jpg", photoPosition: "center", zhPending: true},
  {slug: "donald-chan", surname: "Chan", wtiaRole: false, title: false, organization: false, bio: false, photo: null, photoPosition: "center", zhPending: true},
  {slug: "jimmy-chan", surname: "Chan", wtiaRole: false, title: false, organization: false, bio: false, photo: null, photoPosition: "center", zhPending: true},
  {slug: "ricky-chan", surname: "Chan", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/ricky-chan.jpg", photoPosition: "top", zhPending: true},
  {slug: "burton-chau", surname: "Chau", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/burton-chau.jpg", photoPosition: "center", zhPending: true},
  {slug: "lawrence-cheung", surname: "Cheung", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/lawrence-cheung.jpg", photoPosition: "center", zhPending: true},
  {slug: "simon-ha", surname: "Ha", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/simon-ha.jpg", photoPosition: "center", zhPending: true},
  {slug: "alex-kun", surname: "Kun", wtiaRole: false, title: true, organization: true, bio: true, photo: null, photoPosition: "center", zhPending: true},
  {slug: "larry-lam", surname: "Lam", wtiaRole: false, title: false, organization: false, bio: true, linkedIn: true, photo: "/images/exco/larry-lam.jpg", photoPosition: "center", zhPending: true},
  {slug: "antony-ma", surname: "Ma", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/antony-ma.jpg", photoPosition: "top", zhPending: true},
  {slug: "jess-mak", surname: "Mak", wtiaRole: false, title: true, organization: true, bio: true, photo: "/images/exco/jess-mak.jpg", photoPosition: "center", zhPending: true},
  {slug: "lawrence-poon", surname: "Poon", wtiaRole: false, title: false, organization: false, bio: true, photo: "/images/exco/lawrence-poon.jpg", photoPosition: "center", zhPending: true},
  {slug: "nelson-tse", surname: "Tse", wtiaRole: true, title: true, organization: true, bio: true, photo: "/images/exco/nelson-tse.jpg", photoPosition: "center", zhPending: true},
  {slug: "eric-yung", surname: "Yung", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/eric-yung.jpg", photoPosition: "center", zhPending: true},
];
