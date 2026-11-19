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
// Donald Chan and Jimmy Chan stay name-only: no WTIA role and no biography.
// Their surname Chan comes from existing WTIA Drive records (exco-tree / consent
// notes). The update folder only has an unnamed "Donald" file and
// "Jimmy-Chan.jpeg"; neither Drive photo nor any other-folder bio is used, and
// 陳甘泉 is not displayed. Do not copy the official page's Vice-Chairman line.
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
// lawrence-cheung.jpg (not lawrence-cheung-alt.jpg). Display files keep the
// source aspect; the 4:5 card crops with object-fit and does not pre-crop them.
//
// Alex Kun, Donald Chan, and Jimmy Chan derivatives are withheld.
// Old-site publication does not establish consent. Consent is not established in the supplied evidence. That note is not an exhaustive records search.
// photo stays null, so the page keeps the letter-free fallback. The files are
// not under public/ and are not served. They remain the t520u official-page
// derivatives (mozjpeg progressive, quality 82, no crop, metadata stripped),
// stored at content/exco-portraits-withheld/<slug>.jpg until a consent decision.
//   alex-kun — https://hkwtia.org/wp-content/uploads/2020/02/Alex-Kun-3-scaled-e1588757660518.jpg
//     source 2310×2310 sha256 d0fa7c940ad63f59f17584fe2610d737220b042289fc81134f106a637271b85e
//     derivative 1600×1600 (existing longest-edge convention), aspect 1:1.
//   donald-chan — https://hkwtia.org/wp-content/uploads/2024/10/Donald.jpeg
//     source 1111×1111 sha256 b20089bd0d9450e4a5e5b1c6094b891ebce9cb786a246b68309908a9640ded15
//     dimensions kept. Portrait only.
//   jimmy-chan — https://hkwtia.org/wp-content/uploads/2020/02/Jimmy-Chan-1200x1199.jpg
//     the WP fusion-1200 file, 1200×1199, sha256 812a1b7cdafd23c376cac594eede39c845624e5fb200d4b7269e7b64e7a58a56.
//     Not https://hkwtia.org/wp-content/uploads/2020/02/Jimmy-Chan.jpg (2012×2011 original; that URL returned 520).
//     Aspect kept. Portrait only.

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
  /** Null renders a neutral empty portrait: no initials, monogram, or letters. */
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
