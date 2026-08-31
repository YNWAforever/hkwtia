# WiseTech component port inventory

This inventory records Phase 0 decisions only. It adds no components and does not claim visual parity.

## Evidence basis

Repository base `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`; historical master-plan identity is `wisetech-hong-kong` v13, commit `d2d82c01099490a8c2768c942186735667bbc881`, archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`, and unverified byte/history equivalence. The separate authorized Git donor is PASSED LOCALLY and classifies implementation files as source evidence without importing runtime.

Legend: **repository-verified** means inspected current code; **design-document-verified** means required by the attached design prose only; **master-plan** means an integration requirement; **frozen Git-source evidence** means checked-in authoritative donor artifact classification. Historical byte/history comparison is optional and does not alter runtime ownership.

## Decisions

| Surface/pattern | Decision | Existing authority to reuse | Evidence and boundary |
|---|---|---|---|
| Announcement strip | Port presentation later | Future typed announcement read model; do not hard-code an active claim | Design document/master plan only; no schema in this PR |
| Dual-brand public header | Port presentation later | Current public layout, WTIA legal identity and localized navigation | Frozen donor artifact evidence for presentation; historical byte/history comparison is optional |
| Event-first mega menu | Port interaction later | One typed code-owned navigation config, current real route manifest, `next-intl` paths | Design document; never link retired/unbuilt routes |
| Question-led photographic hero | Port visual structure later | Current home Server Component, message/page-copy fallbacks, own-origin images | Frozen donor photo file/source evidence is available and classified; rights and publication remain unapproved |
| CTA hierarchy and “Discover” cue | Port semantics later | Manifest CTA outcomes and existing routes/actions | Master plan; no duplicate business logic |
| Event/activity cards and registration states | Rebuild over current data | Published event repository and localized event detail | Repository plus design document; never static mock events |
| Member/solution cards | Rebuild over current data | `showcase_listings`, curated media, review gates and lead action | Repository plus design document; never infer member status from a logo |
| Editorial inner-page shell | Port layout patterns later | Existing public layout, metadata helpers, bilingual messages and safe body renderer | Frozen donor artifact evidence for presentation; historical byte/history comparison is optional |
| Programme edition/gallery treatment | Rebuild around typed records | Four separate programme contracts and tracked verified archive images | Repository plus design document; no generic loose schema |
| Floating Ask WiseTech shell | Port presentation only | Existing `ConciergeWidget`, guarded API, conversations and approvals | Master plan/repository; do not copy a Site-side AI runtime |
| Language control | Reuse | Current `LocaleSwitcher` serializes `useSearchParams()` and calls the locale-aware router | Repository-verified; never construct `/zh-HK` hrefs |
| Join/checkout layouts | Visual alignment only | Current focused join route group, Neon Auth and server-owned Stripe services | Master plan/repository; no marketing mega menu inside transaction flow |
| Member portal/admin chrome | Token alignment only | Current authenticated layouts and authorization boundaries | Master plan/repository; no public marketing navigation injection |
| Loading/empty/error states | Reuse and extend per real data source | Current App Router and localized recovery patterns | Design acceptance requirement; scope belongs with each future slice |
| Iconography | Rebuild/reuse | Installed `lucide-react` with accessible labels | Frozen donor icon source evidence remains unreviewed and non-publishable; rebuild approved semantics |
| Site runtime/router/forms | Reject | hkwtia App Router, Server Actions and repositories remain sole authority | Master-plan non-negotiable boundary |
| Copied Site logo walls/testimonials/metrics | Reject until verified | Reviewed showcase, future partner authority, evidence-backed metrics | Frozen donor logo/metric/testimonial source evidence is available and classified; current-data, relationship, rights, and publication remain unapproved |
| Remote prototype image hosts | Reject | Own-origin repository/media registry and existing CSP | Repository-verified security boundary |
| Arbitrary CMS page builder or executable HTML | Reject | Allowlisted bilingual page-copy leaves and audited typed CMS records | Master-plan authority model |

## Data and migration implications

Presentation ports must accept server-provided view models rather than creating browser-side data access. Events, news, showcase, cohorts, programme records, membership plans, AI evidence and identity retain their current owners. Announcements, partners, upload storage, localized article bodies and any inquiry model remain future, explicitly reviewed additions; this record neither creates those schemas nor authorizes migration/seeding.

All 13 donor app artifacts and 33/18/16 function groups are locally reconciled source evidence. Historical bytes may later be compared for non-blocking provenance only; “port” still means planned presentation patterns, not a runtime import.

## Authoritative donor artifact boundary

The user-authorized donor `https://github.com/YNWAforever/wisetech` is locally reconciled at `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, 138 tracked files, and tree-list SHA-256 `79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c`; Git source status is PASSED LOCALLY. The historical `d2d82c01099490a8c2768c942186735667bbc881` / `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54` identity remains unverified.

All 13 donor app artifacts are classified in the frozen inventory. The main function groups are 33/18/16 in `WiseTechSite.tsx`, `ExpansionPages.tsx`, and `FullInnerPages.tsx`. The only permitted reuse is presentation patterns only: no donor router/auth/D1/Workers/runtime import. hkwtia App Router, next-intl, authorization, repositories, and Concierge remain owners.

See [authoritative source reconciliation](wisetech-authoritative-source-reconciliation.md).

| Donor app artifact | Disposition |
|---|---|
| `app/ExpansionPages.tsx` | merge presentation patterns |
| `app/FullInnerPages.tsx` | merge presentation patterns |
| `app/WiseTechSite.tsx` | merge presentation patterns |
| `app/[lang]/[[...slug]]/page.tsx`, `app/[lang]/layout.tsx`, `app/layout.tsx`, `app/globals.css`, `app/megaNav.ts`, `app/sitemap.ts`, `app/visualData.ts` | merge presentation/accessibility/source evidence only |
| `app/chatgpt-auth.ts`, `app/page.tsx`, `app/partnerData.ts` | retire; no auth redirect or relationship runtime import |

These grouped rows enumerate all 13 donor app artifacts and their frozen dispositions. Function groups remain 33 in `WiseTechSite.tsx`, 18 in `ExpansionPages.tsx`, and 16 in `FullInnerPages.tsx`.
