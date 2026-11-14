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
// card links to https://www.linkedin.com/in/larry-lam-2175a216/?isSelfProfile=false
// as its own field, not inside the biography.
//
// Order: Willy Lai first, then surname A–Z, and given name A–Z when the surname
// matches (Donald Chan, Jimmy Chan, Ricky CHAN). Provisional, not a precedence list.
//
// Donald Chan and Jimmy Chan are name-only placeholders. Their surname Chan comes
// from existing WTIA Drive records (exco-tree / consent notes). The update folder
// only has "Donald" and "Jimmy-Chan.jpeg"; neither photo nor any other-folder bio
// is used, and 陳甘泉 is not displayed.
//
// zhPending is false for the twelve members whose approved Traditional Chinese
// bios are in messages/zh-HK.json (Willy approve 14 Nov 2026, t462s2118 / t464u).
// Donald Chan and Jimmy Chan stay zhPending: they are still name-only.
// Never 會長. Willy's zh-HK role and title are both 主席.
//
// Approved zh-HK role labels now shown on the page:
// Chairman = 主席
// Vice Chairman = 副主席
// Treasurer & Executive Committee Member = 司庫及執行委員會委員
// Legal Advisor = 法律顧問
// ExCo Member = 執行委員會委員
//
// Photos live at public/images/exco/<slug>.jpg. lawrence-cheung uses
// lawrence-cheung.jpg (not lawrence-cheung-alt.jpg). Alex, Donald, and Jimmy
// have no photo.

export type ExcoRosterMember = Readonly<{
  slug: string;
  surname: string;
  /** messages Committees.roster.<slug>.wtiaRole exists. */
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
   * True only when no approved Traditional Chinese bio exists yet.
   * Donald Chan and Jimmy Chan are the remaining name-only cards.
   */
  zhPending: boolean;
}>;

export const excoRoster: readonly ExcoRosterMember[] = [
  {slug: "willy-lai", surname: "Lai", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/willy-lai.jpg", photoPosition: "center", zhPending: false},
  {slug: "donald-chan", surname: "Chan", wtiaRole: false, title: false, organization: false, bio: false, photo: null, photoPosition: "center", zhPending: true},
  {slug: "jimmy-chan", surname: "Chan", wtiaRole: false, title: false, organization: false, bio: false, photo: null, photoPosition: "center", zhPending: true},
  {slug: "ricky-chan", surname: "Chan", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/ricky-chan.jpg", photoPosition: "top", zhPending: false},
  {slug: "burton-chau", surname: "Chau", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/burton-chau.jpg", photoPosition: "center", zhPending: false},
  {slug: "lawrence-cheung", surname: "Cheung", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/lawrence-cheung.jpg", photoPosition: "center", zhPending: false},
  {slug: "simon-ha", surname: "Ha", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/simon-ha.jpg", photoPosition: "center", zhPending: false},
  {slug: "alex-kun", surname: "Kun", wtiaRole: false, title: true, organization: true, bio: true, photo: null, photoPosition: "center", zhPending: false},
  {slug: "larry-lam", surname: "Lam", wtiaRole: false, title: false, organization: false, bio: true, linkedIn: true, photo: "/images/exco/larry-lam.jpg", photoPosition: "center", zhPending: false},
  {slug: "antony-ma", surname: "Ma", wtiaRole: false, title: true, organization: false, bio: true, photo: "/images/exco/antony-ma.jpg", photoPosition: "top", zhPending: false},
  {slug: "jess-mak", surname: "Mak", wtiaRole: false, title: true, organization: true, bio: true, photo: "/images/exco/jess-mak.jpg", photoPosition: "center", zhPending: false},
  {slug: "lawrence-poon", surname: "Poon", wtiaRole: false, title: false, organization: false, bio: true, photo: "/images/exco/lawrence-poon.jpg", photoPosition: "center", zhPending: false},
  {slug: "nelson-tse", surname: "Tse", wtiaRole: true, title: true, organization: true, bio: true, photo: "/images/exco/nelson-tse.jpg", photoPosition: "center", zhPending: false},
  {slug: "eric-yung", surname: "Yung", wtiaRole: true, title: true, organization: false, bio: true, photo: "/images/exco/eric-yung.jpg", photoPosition: "center", zhPending: false},
];
