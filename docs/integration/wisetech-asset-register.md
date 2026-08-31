# WiseTech asset register

This register separates tracked hkwtia assets from asset categories mentioned by the design documents. It neither imports Site files nor clears any asset for production use.

## Evidence basis and security rule

Repository base `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`; historical master-plan identity: `wisetech-hong-kong` v13, commit `d2d82c01099490a8c2768c942186735667bbc881`, archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`, byte/history equivalence unverified. The separate authorized Git donor is PASSED LOCALLY; all 99 donor asset bytes/filenames are frozen and checksummed as source evidence.

Legend: **repository-verified** = tracked path/count inspected; **design-document-verified** = category requested in prose only; **master-plan** = integration rule; **authoritative-donor evidence** = frozen file-level source index with unreviewed rights metadata. Donor assets remain non-publishable.

The repository security boundary is own-origin: `next.config.ts` emits `img-src 'self' data:` and deliberately defines no remote image host allowlist. New remote prototype hosts must not be added merely to make donor assets render. A final asset also needs appropriate rights, safe file validation, an owned storage path and useful localized alt text where informative.

## Register

| Manifest category | Current repository evidence | CSP/storage rule | Disposition | Rights and alt-text status | Archive reconciliation gate |
|---|---|---|---|---|---|
| WTIA identity logo | `public/images/wtia-logo.png` (1 tracked root asset) | Own-origin tracked file | Retain | Legal identity asset; this record does not re-license it or assert all usage contexts have reviewed alt text | Compare any donor dual-brand asset; donor logo is not automatically authoritative |
| Current page heroes | `public/images/about-hero.jpg`, `public/images/projects-hero.jpg` (2 tracked root assets) | Own-origin tracked files | Retain subject to page-level review | Tracked usage is evidence of availability, not a blanket rights/alt audit | Compare composition and rights; do not copy unknown donor filenames |
| Institutional history archive | 72 tracked files under `public/images/history/` | Own-origin tracked files tied to typed records | Retain only with matching verified record | Record associations exist; this register does not claim all 72 files have completed rights and localized-alt review | Reconcile donor duplicates/variants/checksums and source notes |
| Programme archive | 180 tracked files under `public/images/programs/` | Own-origin tracked files tied to four typed programme contracts | Retain only with matching verified record | Existing content work supplies evidence associations, but a complete 180-file visual/rights/alt audit is not asserted here | Reconcile donor duplicates/variants/checksums and source notes |
| Site photographic hero/event/community images | Frozen donor file evidence; unreviewed, retired, and non-publishable | Must become validated own-origin media; no remote wildcard | Retire from current import scope | Rights, provenance, dimensions, focal point and localized alt text remain unreviewed | Publication requires separate rights and alt-text review |
| Site member/company logos | Frozen donor file evidence; unreviewed, retired, and non-publishable | Must be own-origin and attached to an approved listing | Retire from current import scope | Relationship, rights, and membership meaning remain unreviewed | Publication requires reviewed listing, relationship, and rights |
| Site partner/sponsor logos | Frozen donor file evidence; unreviewed, retired, and non-publishable | Must be own-origin and attached to a future approved partner record | Retire from current import scope | Relationship, rights, and sponsorship meaning remain unreviewed | Publication requires approved partner authority and rights |
| Site interface icons | Category appears in design instructions; no file list | Rebuild with installed `lucide-react` and accessible labels | Merge into repository icon system | No donor file is cleared or needed | Reconcile only if the archive proves a unique, licensed semantic asset |

Tracked repository count at this evidence pass: 255 files under `public/images/` (3 root, 72 history, 180 programmes). Counts prove presence only; they do not prove complete visual QA, rights clearance or alt-text quality.

## Non-claims and exit gate

- No Site v13 filename, checksum, member, partner, testimonial or image right has been inferred from the design prose.
- No prototype logo is classified as a member or partner record.
- No unverified image is cleared for production.
- No asset upload/storage provider action is authorized.

All donor files are already checksummed/classified as unreviewed, retired, and non-publishable source evidence. Historical archive comparison remains optional non-blocking provenance; rights and alt-text review are publication gates only, not source-reconciliation gates.

## Authoritative donor asset evidence

The user-authorized donor `https://github.com/YNWAforever/wisetech` was locally reconciled at `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, 138 tracked files, and tree-list SHA-256 `79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c`; status is PASSED LOCALLY. The historical `d2d82c01099490a8c2768c942186735667bbc881` / `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54` archive identity remains unverified.

All 99 assets are indexed with exact source path, category, and SHA-256: 6 archive images, 2 brand assets, 5 editorial images, 7 root assets, and 79 historical partner logos. Their fingerprint is `c864faa2057bfe1257d0db9ff6166717d73a3cae90d957bfecdc0921bbbbff79`. They are unreviewed, retired, and non-publishable. The 79 historical partner logos do not establish relationship, rights, or publication. Current hkwtia assets remain separate; their tracked status does not approve donor assets.

See [authoritative source reconciliation](wisetech-authoritative-source-reconciliation.md).
The 99 exact source-path/category/SHA-256 rows are indexed in `config/wisetech-authoritative-source-inventory.ts` and pinned by `tests/unit/wisetech-authoritative-source-reconciliation.test.ts`; this register deliberately does not duplicate donor files or make the index a publication manifest.
