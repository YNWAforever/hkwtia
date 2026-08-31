# WiseTech content and ownership mapping

This document maps content to existing authorities so a later visual port cannot create a second editable truth. It performs no content migration, schema change, provider action or production mutation.

## Evidence basis

Repository base: `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`. Historical master-plan identity: `wisetech-hong-kong` v13, commit `d2d82c01099490a8c2768c942186735667bbc881`, archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`; byte/history equivalence remains unverified. The separate authorized Git donor is PASSED LOCALLY for frozen implementation/source evidence, not current data.

Evidence legend: `hkwtia-repository` is current code/data ownership; `site-v13-design-doc` is design intent only; `master-plan` is the integration requirement; checked-in donor `site-v13-source` evidence is source-only and cannot close current-data parity.

## Canonical ownership

| Content concern | Current/future authority | Migration implication | Evidence status |
|---|---|---|---|
| Organization identity, legal name and structured data | hkwtia code/metadata | WiseTech may be public platform expression; WTIA remains legal identity | Repository/master plan |
| Public marketing copy | English and Traditional Chinese message bundles plus allowlisted `page_copy` overrides | Port approved copy into shipped bilingual fallback first; no free-form page builder | Repository/master plan |
| Announcement content | No current typed announcement authority | Future additive, audited model only after approval; no hard-coded “current” announcement | Master plan; not implemented |
| Events and registration | `events`, `event_registrations`, event CMS | Bind new cards/details to publication and registration state; import no static Site events | Repository-verified |
| News/editorial | `posts` with staff news CMS and safe renderer | Preserve publish/unpublish/archive audit; localized body work is a separate migration | Repository/master plan |
| Institutional history | Typed milestone records and tracked history assets | Preserve corrected records and source associations; never use claim-log prose as authority | Repository-verified |
| Programme history | Separate typed ASA, CPAI, HKICT and TCT contracts | Do not replace with a generic incomplete programme schema; future design wraps these records | Repository-verified |
| Membership presentation | Canonical plan codes, seeded plan data, Stripe configuration and localized copy | Future server-side catalog adapter must reconcile these sources before redesign | Repository/master plan |
| Join/application | Authenticated profile/company steps and membership application state | Visual alignment only; preserve branches and server-side authorization | Repository-verified |
| Public member/solution discovery | Reviewed `showcase_listings`, curated `media`, `leads` | Site logo/name content is not importable membership evidence | Repository/master plan |
| Partners/sponsors | No single approved published partner authority | Future distinct partner model and audited CMS only after approval | Master plan; absent now |
| Launch Pad | `cohorts`, `cohort_applications`, verified funding rules | Resolve config/table partner duplication separately; never publish fictional cohorts | Repository/master plan |
| Contact/inquiries | Current page contains verified contact channels; no durable general inquiry record is claimed | A persisted inquiry model and action require separate approval before a “submit” form can exist | Repository/master plan |
| AI Concierge | Existing widget, API, conversations, approvals and knowledge/runtime controls | Replace presentation only; retain rate limits, Turnstile, ownership and approval rules | Repository-verified |
| AI-Ops metrics | Existing evidence formulas/materialised metrics | Never fill sparse metrics with invented outcomes | Repository/master plan |
| Portal content | Member/company-owned records behind current authorization | Share tokens, not marketing navigation or public data assumptions | Repository-verified |
| Admin CMS/CRM | The 20 explicit localized admin `page.tsx` owners in `config/wisetech-protected-route-inventory.ts` plus their authorised audited repositories/actions | Extend only for a proven content gap; any new/deleted page must update the bidirectional inventory | Master-plan `/admin/*` family plus repository-verified file owners |
| Server API, webhooks and jobs | The 17 explicit `app/api/**/route.ts` owners: 6 general handlers, 2 webhooks and 9 jobs | Preserve authentication, idempotency and secrets; any new/deleted handler or classification change must update the bidirectional inventory | Master-plan `/api/*` family plus repository-verified file owners |
| Locale routing | `next-intl`, current switcher and `/zh` public prefix | Preserve path/query via router locale replacement; do not store `/zh-HK` browser links | Repository-verified |
| Assets and alt text | Tracked own-origin assets plus frozen donor source inventory | All donor source inventory is reconciled; rights, relationship, localized alt text, and publication remain separate reviews | Repository/design document; historical archive bytes are optional provenance only |

The protected route inventory is code-ownership evidence only. Route groups do not add URL segments, the locale wrapper is removed, and dynamic/catch-all patterns retain Next.js notation. All donor source inventory is reconciled as frozen evidence; historical archive bytes are optional provenance only and proposed design-only routes still require current owners.

## CTA content rules

- “Find Event or Activity” links to `/events` and can describe only published records.
- “Join WiseTech” begins at `/membership`, then uses `/join?plan=<canonical-plan>`; labels/prices must agree with the canonical plan adapter before any redesign ships.
- “Explore Members & Solutions” links to `/showcase`; logos and claims require reviewed listing/media records.
- “Ask WiseTech” invokes the existing Concierge action; a new shell cannot create a second assistant runtime.
- “Register interest” maps only to `/events` backed by published event records or `/launchpad` backed by published/open cohort records. General contact inquiry capture is unavailable and remains future work until an approved persisted schema and action exist.

## Migration and archive gates

No schema or seed is authorized by this document. Future additions named in the master plan—announcements, partners, media upload, event presentation fields, localized article bodies, general inquiries, approved resources and unified membership catalog—each need their own design, migration, rollback and isolated-data verification.

Site content has been reconciled as frozen source evidence, not current data. If historical bytes are later supplied, compare them only for optional byte/history provenance without overwriting repository/CMS authority; no Phase 0 delivery gate depends on that comparison.

## Authoritative donor content boundary

The user-authorized Git donor is `https://github.com/YNWAforever/wisetech` at `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, with 138 tracked files and tree-list SHA-256 `79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c`; reconciliation is PASSED LOCALLY. It is source evidence, not current data. The historical identity `d2d82c01099490a8c2768c942186735667bbc881` / `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54` remains unverified and separate.

The frozen buckets (52 bilingual headings, 14 navigation sets, 21 inner-route checks, 4 enquiry checks, 5 Chinese parity checks, 2 historical events, and 79 partner records) are source evidence, not current data. There is no donor event/programme edition/metrics/testimonials/membership/portal/form persistence import. Current hkwtia repositories and publication authorities remain the only data authority.

See [authoritative source reconciliation](wisetech-authoritative-source-reconciliation.md) for its deterministic offline evidence contract.
