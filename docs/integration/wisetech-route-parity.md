# WiseTech route parity evidence

This is the human-readable route/CTA view of `config/wisetech-integration-manifest.ts` plus the protected code-owner view of `config/wisetech-protected-route-inventory.ts`. The validator independently checks every non-retired canonical path and every member of a supplied chain against App Router pages, exact `next.config.ts` source-to-destination redirect mappings, or the existing Concierge action. It separately requires bidirectional equality between the explicit protected inventory and every discovered App Router `page.{tsx,ts,jsx,js}` or `route.{tsx,ts,jsx,js}` convention file whose normalized route falls under the exact `/admin` or `/api` boundary. Discovery is independent of convention kind; ownership validation then requires admin pages to use `page.*` and API handlers to use `route.*`. Destination chains are allowed only on non-retired entries, must be nonempty, and must begin with `canonicalPath`; retired entries have neither a canonical target nor a destination chain. Repository patterns are directional wildcards, and redirect entries must match their configured target. This is classification evidence, not a claim that design-only pages have been built.

## Evidence basis and open gate

- Repository integration base: `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`.
- Repository evidence inspected for this record: task anchor `8cb72eccc7c57a5b00b4ca84308758aa8592ac99`.
- Site identity reported by the master plan: project `wisetech-hong-kong`, saved version `13`, source commit `d2d82c01099490a8c2768c942186735667bbc881`, reported archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`.
- The authoritative Site archive is not available in this workspace. Its bytes, route files, CTA implementations, forms, locale code, components, content and assets have not been reconciled. Phase 0 parity therefore remains open.

| Evidence label | Meaning in this record |
|---|---|
| `hkwtia-repository` | Verified in the App Router, redirect configuration, action/component, typed content or repository assets. |
| `site-v13-design-doc` | Stated by an attached design instruction; not verified against Site source files. |
| `master-plan` | Required by the integration plan, including the CTA contract and the `/admin/*` and `/api/*` families. |
| `site-v13-source` | Reserved for evidence from the transferred archive. There are currently zero such entries. |
| Unavailable archive | A known Site identity/hash without locally inspectable archive bytes; never parity-closure evidence. |

The integration manifest has 127 entries: route 110, CTA 5, form 3, locale 1 and asset 8. Dispositions are retain 47, redirect 4, merge 61 and retire 15. Evidence labels are repository 52, design document 70, master plan 5 and Site source 0. The separate protected inventory has 37 repository-owned code routes: 20 admin pages and 17 API handlers, classified as 6 general API handlers, 2 webhook handlers and 9 job handlers.

## Repository-backed canonical routes

Each row below is a `retain` route with `hkwtia-repository` evidence. Dynamic patterns use the App Router `[slug]` spelling.

| Manifest source/canonical path | Durable authority |
|---|---|
| `/` | Home App Router page and repository/CMS read models |
| `/about` | About page and allowlisted page copy |
| `/about/chairman` | Chairman page and approved copy/media |
| `/about/committees` | Committees page and approved governance copy |
| `/about/history` | Typed history records and tracked archive media |
| `/about/history/[slug]` | Typed milestone record by slug |
| `/events` | Published events repository and event CMS |
| `/events/[slug]` | Published event detail by slug |
| `/programs/asa`, `/programs/cpai`, `/programs/hkict`, `/programs/tct` | Four separate verified typed programme records |
| `/membership` | Page copy plus canonical membership plan codes |
| `/join`, `/join/profile`, `/join/company`, `/join/checkout`, `/join/complete` | Authenticated application and server-owned checkout state |
| `/showcase`, `/showcase/[slug]` | Reviewed published listings, media and introduction leads |
| `/launchpad` | Published cohorts and authenticated cohort applications |
| `/news`, `/news/[slug]` | Published news repository and staff CMS |
| `/ai-ops` | Materialised operational metrics and evidence links |
| `/ai-transparency` | Fixed trust structure plus page copy |
| `/contact` | Verified contact details/page copy; no persisted inquiry form is claimed |
| `/privacy` | Reviewed fixed policy structure |
| `/unsubscribe` | Signed suppression workflow and system data |
| `/portal`, `/portal/profile`, `/portal/company` | Authenticated member/company data |
| `/portal/company/seats`, `/portal/company/seats/accept` | Company seat and invitation state |
| `/portal/directory`, `/portal/company/listing`, `/portal/events`, `/portal/documents`, `/portal/billing` | Existing member read/mutation models for each surface |
| `/admin` | Staff-authorised CMS/CRM entry point; nested owners are enumerated below |
| `/api/ai/concierge` | Existing guarded Concierge action; all API owners are enumerated below |

These rows cover every current destination represented by the master plan's route-and-journey matrix, including `/unsubscribe` and all four required public `[slug]` patterns. The `/portal/*` matrix family remains represented by its explicit current destinations. The master-plan `/admin/*` and `/api/*` family evidence is retained, but family completeness is established only by the protected inventory below; no representative route stands in for its siblings.

## Protected route family ownership

The master plan is the requirements evidence for the `/admin/*` and `/api/*` families. Each file/path owner below is independently marked `hkwtia-repository`. Route groups such as `(admin)` do not contribute a URL segment; the locale wrapper is removed from the canonical ownership path; `[id]`, `[...path]` and `[[...path]]` remain deterministic Next.js patterns. Every installed default `page.{tsx,ts,jsx,js}` and `route.{tsx,ts,jsx,js}` convention file is discovered when its normalized route lies under exact `/admin` or `/api`; `/administrator` and `/public-api` remain excluded. The validator then accepts `page.*` only for the admin family and `route.*` only for the API family, so a wrong-kind file under either protected boundary produces a structured ownership error instead of disappearing from discovery.

| Classification | Exact current canonical routes |
|---|---|
| Admin pages (20) | `/admin`; `/admin/approvals`; `/admin/at-risk`; `/admin/automations`; `/admin/cohorts`; `/admin/cohorts/[id]`; `/admin/events-mgmt`; `/admin/events-mgmt/[id]`; `/admin/listings-review`; `/admin/media`; `/admin/media/[id]`; `/admin/members`; `/admin/members/[id]`; `/admin/news`; `/admin/news/[id]`; `/admin/page-copy`; `/admin/page-copy/[namespace]`; `/admin/reports`; `/admin/reports/board-drafts/[id]`; `/admin/segments` |
| General API handlers (6) | `/api/admin/segments/[id]/export`; `/api/ai/concierge`; `/api/ai/conversations/[id]/feedback`; `/api/auth/[...path]`; `/api/showcase/[slug]/view`; `/api/unsubscribe` |
| Webhook handlers (2) | `/api/stripe/webhook`; `/api/webhooks/woztell` |
| Job handlers (9) | `/api/jobs/aiops-metrics`; `/api/jobs/approvals-expirer`; `/api/jobs/board-reporter`; `/api/jobs/chat-retention`; `/api/jobs/engagement-score`; `/api/jobs/journey-runner`; `/api/jobs/renewal-runner`; `/api/jobs/retention-analyst`; `/api/jobs/worker-alert` |

The contract compares exact normalized file paths and canonical paths in both directions. A new code route without an owner, a deleted code route with a stale owner, a fabricated owner, a duplicate owner, a wrong family, or a webhook/job classified as a general handler all fail. This inventory proves current `hkwtia` code ownership only; it does not classify any unavailable Site archive route.

## Explicit current redirects

| ID | Source | Real destination | Evidence |
|---|---|---|---|
| `route-legacy-projects` | `/projects` | `/programs/asa` | `next.config.ts` permanent redirect |
| `route-legacy-history` | `/history` | `/about` | `next.config.ts` permanent redirect |
| `route-design-members` | `/members` | `/showcase` | `next.config.ts` redirect |
| `route-legacy-member-detail` | `/members/:id` | `/showcase` | `next.config.ts` redirect |

The validator receives the full source-to-destination mapping and rejects a fabricated source or a wrong target even when the claimed target is otherwise a real page. The broader legacy redirect fixture is outside the Site-specific parity scope and remains covered by `tests/unit/redirects.test.ts`.

## Design-document routes merged into real destinations

These are classification decisions, not implemented redirects or newly published pages. Every destination is a current App Router page.

| Real destination | Design-document sources classified `merge` |
|---|---|
| `/about` | `/why-wisetech` |
| `/about/chairman` | `/about/leadership` |
| `/about/committees` | `/about/governance` |
| `/membership` | `/for-corporates`, `/for-professionals` |
| `/events` | `/for-smes`, `/ai-plus/education-future-of-work`, `/activities`, `/activities/ai-clinics`, `/activities/buyer-days`, `/activities/industry-councils`, `/activities/training`, `/activities/community`, `/insights/event-replays` |
| `/showcase` | `/for-startups`, `/ai-plus/commerce-professional-services`, `/ai-plus/manufacturing-robotics`, `/ai-plus/health-life-sciences`, `/ai-plus/retail-creative-industries`, `/solutions`, `/verification`, `/gba/gone-global`, `/insights/case-studies` |
| `/showcase/[slug]` | `/members/[slug]`, `/solutions/[slug]`, `/request-introduction` |
| `/launchpad` | `/for-gba-global`, `/activities/gba-delegations`, `/programmes/launchpad`, `/gba`, `/gba/market-entry`, `/gba/delegations`, `/insights/gba-intelligence` |
| `/ai-transparency` | `/ai-plus`, `/ai-plus/responsible-ai-data-cybersecurity`, `/insights/responsible-ai`, `/responsible-ai` |
| `/contact` | `/submit-challenge`, `/activities/mentoring-volunteering`, `/host-an-activity`, `/gba/soft-landing`, `/gba/partner-network`, `/partner-with-us` |
| `/programs/asa` | `/programmes/asa` |
| `/programs/cpai` | `/programmes/cpai` |
| `/programs/hkict` | `/programmes/hkict` |
| `/programs/tct` | `/programmes/tct` |
| `/news` | `/insights`, `/insights/guides`, `/insights/industry-perspectives` |
| `/news/[slug]` | `/insights/[slug]` |
| `/join/complete` | `/join/success` |
| `/portal/company/seats` | `/portal/seats` |
| `/portal/company/listing` | `/portal/solution` |

The design map's already-canonical routes (`/events`, `/events/[slug]`, `/membership`, `/join`, `/about`, `/about/history`, `/about/committees`, `/ai-transparency`, `/ai-ops`, `/contact`, `/privacy`, and the current portal routes) are represented once in the repository-backed table to keep source patterns unique.

## Explicitly retired design-only routes

`canonicalPath` is `null` only for these justified gaps. Retire here means “do not publish or link this proposed route in the current integration,” not deletion of existing production content.

| Source | Reason |
|---|---|
| `/programmes` | No generic programme index; an arbitrary redirect would privilege one of four records. |
| `/programmes/[slug]`, `/programmes/[slug]/[edition]` | No generic programme/edition repository or dynamic route. |
| `/partners` | No verified published partner model; a logo wall would risk relationship misrepresentation. |
| `/search` | No repository-backed public search surface. |
| `/accessibility` | No reviewed standalone page. |
| `/terms` | No reviewed standalone terms page. |
| `/portal/introductions` | No member introduction inbox route. |
| `/portal/programmes` | No member programme-management route. |
| `/portal/councils` | No member council-management route. |
| `/portal/gba` | No member GBA-management route. |
| `/portal/preferences` | No consolidated preferences route. |

## CTA, form and locale contract

| ID | Required outcome | Durable owner |
|---|---|---|
| `cta-find-event` | `/events` | Published events repository |
| `cta-join-wisetech` | `/membership` then `/join?plan=<canonical-plan>` | Canonical plans, application state, server checkout |
| `cta-explore-members-solutions` | `/showcase` | Reviewed published listings |
| `cta-ask-wisetech` | Existing `ConciergeWidget` action at `/api/ai/concierge` | Conversations, approvals and guarded API |
| `cta-register-interest` | `/events` or `/launchpad` only | `events` or `cohorts`; general contact inquiry capture is unavailable until an approved persisted schema/action exists |
| `form-event-registration` | `/events/[slug]` | `events`, `event_registrations` |
| `form-cohort-application` | `/launchpad` | `cohorts`, `cohort_applications`; form is absent without an open cohort |
| `form-showcase-introduction` | `/showcase/[slug]` | Reviewed listing and `leads` |
| `locale-language-toggle` | Current pathname plus the `useSearchParams()` query serialized with `.toString()` when non-empty (no bare `?`), then `router.replace(href, {locale})` | `next-intl`; `zh-HK` maps to public `/zh`, never a constructed `/zh-HK` path |

## Exit condition

The machine-readable boundary passes against the current repository and catches injected invalid canonicals with otherwise valid chains, empty/inconsistent chains, chains on retired entries, submitted dynamic patterns, fabricated/wrong-target redirects, unsupported durable owners/actions, unmapped routes and nonexistent CTA destinations. The protected family contract additionally discovers every installed default page/route convention file under exact protected boundaries before kind/family validation, and catches wrong-kind files, new code routes, deleted code routes, fabricated owners, wrong file conventions, family drift and webhook/job misclassification while pinning the exact current 20/17 ownership sets. It also pins zero `site-v13-source` entries while the archive is unavailable and deep-freezes all inventory objects and nested contract arrays. That does not close Site parity. Closure requires a credential-safe archive transfer, verification of the reported archive hash, and reconciliation of every source route, CTA, form, locale, component, content item and asset without introducing fabricated data or destinations.
