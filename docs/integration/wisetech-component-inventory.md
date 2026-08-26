# WiseTech component port inventory

This inventory records Phase 0 decisions only. It adds no components and does not claim visual parity.

## Evidence basis

Repository base `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`; repository evidence anchor `8cb72eccc7c57a5b00b4ca84308758aa8592ac99`. The master plan reports Site project `wisetech-hong-kong`, saved version 13, source commit `d2d82c01099490a8c2768c942186735667bbc881`, and archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`. The archive itself is unavailable, so component names, props, responsive behaviour and implementation files cannot be marked `site-v13-source`.

Legend: **repository-verified** means inspected current code; **design-document-verified** means required by the attached design prose only; **master-plan** means an integration requirement; **source-archive unavailable** means no source-level classification is possible.

## Decisions

| Surface/pattern | Decision | Existing authority to reuse | Evidence and boundary |
|---|---|---|---|
| Announcement strip | Port presentation later | Future typed announcement read model; do not hard-code an active claim | Design document/master plan only; no schema in this PR |
| Dual-brand public header | Port presentation later | Current public layout, WTIA legal identity and localized navigation | Design document; exact Site source component unavailable |
| Event-first mega menu | Port interaction later | One typed code-owned navigation config, current real route manifest, `next-intl` paths | Design document; never link retired/unbuilt routes |
| Question-led photographic hero | Port visual structure later | Current home Server Component, message/page-copy fallbacks, own-origin images | Design document; Site photo file and rights unavailable |
| CTA hierarchy and “Discover” cue | Port semantics later | Manifest CTA outcomes and existing routes/actions | Master plan; no duplicate business logic |
| Event/activity cards and registration states | Rebuild over current data | Published event repository and localized event detail | Repository plus design document; never static mock events |
| Member/solution cards | Rebuild over current data | `showcase_listings`, curated media, review gates and lead action | Repository plus design document; never infer member status from a logo |
| Editorial inner-page shell | Port layout patterns later | Existing public layout, metadata helpers, bilingual messages and safe body renderer | Design document; source component anatomy unavailable |
| Programme edition/gallery treatment | Rebuild around typed records | Four separate programme contracts and tracked verified archive images | Repository plus design document; no generic loose schema |
| Floating Ask WiseTech shell | Port presentation only | Existing `ConciergeWidget`, guarded API, conversations and approvals | Master plan/repository; do not copy a Site-side AI runtime |
| Language control | Reuse | Current `LocaleSwitcher` calling `router.replace(pathname, {locale})` | Repository-verified; never construct `/zh-HK` hrefs |
| Join/checkout layouts | Visual alignment only | Current focused join route group, Neon Auth and server-owned Stripe services | Master plan/repository; no marketing mega menu inside transaction flow |
| Member portal/admin chrome | Token alignment only | Current authenticated layouts and authorization boundaries | Master plan/repository; no public marketing navigation injection |
| Loading/empty/error states | Reuse and extend per real data source | Current App Router and localized recovery patterns | Design acceptance requirement; scope belongs with each future slice |
| Iconography | Rebuild/reuse | Installed `lucide-react` with accessible labels | Design document; unidentified archive icon files are rejected |
| Site runtime/router/forms | Reject | hkwtia App Router, Server Actions and repositories remain sole authority | Master-plan non-negotiable boundary |
| Copied Site logo walls/testimonials/metrics | Reject until verified | Reviewed showcase, future partner authority, evidence-backed metrics | Archive unavailable; prototypes are not production records |
| Remote prototype image hosts | Reject | Own-origin repository/media registry and existing CSP | Repository-verified security boundary |
| Arbitrary CMS page builder or executable HTML | Reject | Allowlisted bilingual page-copy leaves and audited typed CMS records | Master-plan authority model |

## Data and migration implications

Presentation ports must accept server-provided view models rather than creating browser-side data access. Events, news, showcase, cohorts, programme records, membership plans, AI evidence and identity retain their current owners. Announcements, partners, upload storage, localized article bodies and any inquiry model remain future, explicitly reviewed additions; this record neither creates those schemas nor authorizes migration/seeding.

The source-archive gate remains open. After the archive is safely attached and its reported hash verified, reconcile actual Site component files and responsive states against these decisions. Until then, “port” means a planned pattern, not a verified file-for-file component inventory.
