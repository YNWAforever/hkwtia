/**
 * SEO/GEO disposition for Willy's widget reply t578s2629
 * (2026-11-19 05:07 Asia/Hong_Kong, to Casey).
 *
 * The table is the implementation of T01 and the parts of T02–T09 that must
 * stay undecided. It does not bind a domain, submit a sitemap, or change
 * robots, protection, auth, or billing. Public copy for the verified answers
 * lives in the message bundles; this module only records what was done and
 * what remains HOLD.
 */

export const seoGeoApproval = {
  id: "t578s2629",
  approver: "Willy",
  repliedTo: "Casey",
  at: "2026-11-19T05:07:00+08:00",
  timezone: "Asia/Hong_Kong",
  startingSha: "da716b572fd9be6d0f6a4ff3e936edd3a47f2049",
} as const;

export const environments = [
  {
    id: "legacy-hkwtia-org",
    host: "https://hkwtia.org/",
    role: "legacy-url-and-official-content-source",
    indexability: "unchanged",
    note: "One HTTP 403 does not prove a lasting outage. Whether this hostname stays is undecided.",
  },
  {
    id: "public-main",
    host: "https://hkwtia.vercel.app/",
    role: "current-public-main",
    indexability: "unchanged",
    note: "A public 200 is not an approved launch and not an approved canonical domain.",
  },
  {
    id: "draft-239",
    host: null,
    role: "protected-draft-preview",
    indexability: "not-a-crawl-target",
    note: "Draft #239 stays separate. SSO protection is not treated as a crawl defect.",
  },
] as const;

export const holdItems = [
  {id: "D1-formal-origin", spec: "T01", fact: "Formal origin, cutover, and go-live are not decided. APPROVED_ORIGIN is not deployed."},
  {id: "D1-news-ledger", spec: "T02", fact: "Per-post old URL, rights, and render rows are not independently verified. The 49-article / 17-image / 34-page PDF report is Casey's note on draft #239, not a retest, and nothing from it is imported here."},
  {id: "D1-history-redirect", spec: "T03", fact: "The existing /history → /about redirect is not retargeted. Closer-page equivalence is unproven."},
  {id: "D2-founding-date", spec: "A3", fact: "Founding date is not in the new answers. Pre-existing About and History 2001 lines are not newly verified."},
  {id: "D2-eligibility-seats", spec: "M1", fact: "Eligibility and included seats are not stated in the new fee answer."},
  {id: "D2-activation", spec: "M2", fact: "Activation and approval rules are not published as a completed answer."},
  {id: "D2-renewal-refund", spec: "M3", fact: "Renewal, cancellation, and membership refund terms are not filled in. Event-ticket refund policy is not reused as a membership rule."},
  {id: "D2-cpai-qualification", spec: "C2", fact: "CPAI delivery, issuing body, and certificate wording are not newly verified."},
  {id: "D2-cpai-intake", spec: "C3", fact: "No intake date, duration, fee, or registration link is added."},
  {id: "D2-open-events", spec: "E2", fact: "No current open-event list is invented. An empty calendar is not a claim that WTIA has no activities."},
  {id: "D3-measurement", spec: "T09", fact: "No Search Console, Bing Webmaster, analytics, or indexer account is added. Metrics stay N/A. Bot rules are unchanged."},
  {id: "T08-field-data", spec: "T08", fact: "No field or lab sample was taken. Core Web Vitals good-benchmarks are not a current score. No RUM or consent change."},
] as const;

/** Controls this approval does not move. */
export const unchangedControls = [
  "robots",
  "canonical-host",
  "index-submission",
  "protection",
  "auth",
  "billing",
  "env",
] as const;

export const verifiedAnswerKeys = [
  "Home.identity",
  "About.identity",
  "History.announcementNote",
  "Chairman.term",
  "Membership.faq.1.answer",
  "programs.cpai.listedTopics",
  "Events.checkAnswer",
] as const;
