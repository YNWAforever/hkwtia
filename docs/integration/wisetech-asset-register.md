# WiseTech asset register

This register separates tracked hkwtia assets from asset categories mentioned by the design documents. It neither imports Site files nor clears any asset for production use.

## Evidence basis and security rule

Repository base `c0e9d6a786ee7dcff1fa50638bd1ecb36814c58f`; repository evidence anchor `8cb72eccc7c57a5b00b4ca84308758aa8592ac99`. Site identity reported by the master plan: `wisetech-hong-kong` v13, source commit `d2d82c01099490a8c2768c942186735667bbc881`, reported archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`. The archive is unavailable and its asset bytes/filenames were not inspected.

Legend: **repository-verified** = tracked path/count inspected; **design-document-verified** = category requested in prose only; **master-plan** = integration rule; **source-archive unavailable** = no file-level proof or rights metadata. There are zero `site-v13-source` asset entries.

The repository security boundary is own-origin: `next.config.ts` emits `img-src 'self' data:` and deliberately defines no remote image host allowlist. New remote prototype hosts must not be added merely to make donor assets render. A final asset also needs appropriate rights, safe file validation, an owned storage path and useful localized alt text where informative.

## Register

| Manifest category | Current repository evidence | CSP/storage rule | Disposition | Rights and alt-text status | Archive reconciliation gate |
|---|---|---|---|---|---|
| WTIA identity logo | `public/images/wtia-logo.png` (1 tracked root asset) | Own-origin tracked file | Retain | Legal identity asset; this record does not re-license it or assert all usage contexts have reviewed alt text | Compare any donor dual-brand asset; donor logo is not automatically authoritative |
| Current page heroes | `public/images/about-hero.jpg`, `public/images/projects-hero.jpg` (2 tracked root assets) | Own-origin tracked files | Retain subject to page-level review | Tracked usage is evidence of availability, not a blanket rights/alt audit | Compare composition and rights; do not copy unknown donor filenames |
| Institutional history archive | 72 tracked files under `public/images/history/` | Own-origin tracked files tied to typed records | Retain only with matching verified record | Record associations exist; this register does not claim all 72 files have completed rights and localized-alt review | Reconcile donor duplicates/variants/checksums and source notes |
| Programme archive | 180 tracked files under `public/images/programs/` | Own-origin tracked files tied to four typed programme contracts | Retain only with matching verified record | Existing content work supplies evidence associations, but a complete 180-file visual/rights/alt audit is not asserted here | Reconcile donor duplicates/variants/checksums and source notes |
| Site photographic hero/event/community images | No transferred file evidence | Must become validated own-origin media; no remote wildcard | Retire from current import scope | Rights, provenance, dimensions, focal point and localized alt text unknown | Archive bytes plus rights documentation required before any use |
| Site member/company logos | No transferred file evidence; current public authority is reviewed showcase media | Must be own-origin and attached to an approved listing | Retire from current import scope | A prototype logo is not evidence of membership, approval or permission | Match only to a reviewed listing and current relationship before use |
| Site partner/sponsor logos | No transferred file evidence and no approved published partner model | Must be own-origin and attached to a future approved partner record | Retire from current import scope | A prototype logo is not evidence of a current/historical partnership or usage rights | Partner authority, relationship dates, rights and archive file all required |
| Site interface icons | Category appears in design instructions; no file list | Rebuild with installed `lucide-react` and accessible labels | Merge into repository icon system | No donor file is cleared or needed | Reconcile only if the archive proves a unique, licensed semantic asset |

Tracked repository count at this evidence pass: 255 files under `public/images/` (3 root, 72 history, 180 programmes). Counts prove presence only; they do not prove complete visual QA, rights clearance or alt-text quality.

## Non-claims and exit gate

- No Site v13 filename, checksum, member, partner, testimonial or image right has been inferred from the design prose.
- No prototype logo is classified as a member or partner record.
- No unverified image is cleared for production.
- No asset upload/storage provider action is authorized.

The asset parity gate remains open until the authoritative archive is safely transferred, its reported hash verified, every file checksummed and classified, duplicates reconciled, rights recorded, and informative images receive reviewed English and Traditional Chinese alt text.
