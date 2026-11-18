# SEO / GEO implementation record (draft)

Approval: Willy, widget reply to Casey **t578s2629**, 2026-11-19 05:07 Asia/Hong_Kong.
Starting tree: `da716b572fd9be6d0f6a4ff3e936edd3a47f2049` (frozen #235).
This pull request is a draft. It does not merge, deploy, change env, Auth, billing, domains, or protection, and it does not submit any URL for indexing.

The tested record is `lib/seo/geo-disposition.ts`. Public sentences are the message keys named there.

## Implemented

| ID | What landed |
|---|---|
| H1 | Home answers what WTIA is, in English and Chinese. |
| A1 | About names WTIA / WIRELESS as the Hong Kong Wireless Technology Industry Association, 香港無線科技商會. No WISE rename. |
| A2 | History says its summaries are not the original news announcements. |
| A3 | Chairman page states Willy Lai 賴志偉, Chairman since 7 October 2026, term 2026–2028. Person JSON-LD uses that name, title, and start date, and no invented end day. |
| M1 | Membership states the 2026–27 fees: Individual HK$500, Corporate HK$1,800, Platinum HK$4,800. |
| C1 | CPAI page states the published topic list and says to confirm the intake syllabus before enrolling. |
| E1 | Events page says to confirm date, place or format, language, eligibility, fee, and registration before making arrangements. |
| T04 | Existing self-canonical and `en` / `zh-HK` / `x-default` alternates stay. The public host is unchanged. |
| T05 | Sitemap `lastmod` is omitted when the only available stamp would be the build. Static pages still use the page file's mtime. News still uses `publishedAt`. Robots rules are unchanged. |
| T06 | Organisation JSON-LD stays `Organization`. No founding date, member count, registration number, or Course markup was added. |
| T07 | The verified answers are in the server-rendered HTML. |

## HOLD (not filled in)

Formal origin and go-live. Per-post news and media ledger, including the Casey-reported draft #239 counts, which this branch did not retest or import. Retargeting `/history`. Founding date. Eligibility and seats. Activation. Renewal, cancellation, and membership refunds. CPAI qualification, issuer, and certificate. CPAI intake. Which events are open. Search Console, Bing Webmaster, analytics, and any indexer account. Core Web Vitals field or lab scores.

Pre-existing About and History lines that mention 2001 are unchanged and are not treated as a new verified founding date.
