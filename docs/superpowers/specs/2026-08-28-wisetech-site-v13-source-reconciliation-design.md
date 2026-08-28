# WiseTech Site v13 Source Reconciliation Design

## Goal

Close the source-evidence portion of Phase 0 by recording the user-authorized `YNWAforever/wisetech` repository as the authoritative Site v13 implementation reference, while preserving the distinct historical archive identity reported by the master plan.

This supplement changes evidence only. It does not import donor runtime code or content, alter the public design, add schema, seed data, call providers, deploy, or claim production approval.

## Provenance decision

Two source identities remain deliberately separate:

- **Reported archive identity:** Site slug `wisetech-hong-kong`, saved version `13`, commit `d2d82c01099490a8c2768c942186735667bbc881`, and reported archive SHA-256 `411837ea096a11d3a7f49f77f028879b1f4c3599ab643d1ee3ce92de56a02e54`.
- **User-authorized Git donor:** `https://github.com/YNWAforever/wisetech`, pinned commit `f91ecc5fa29c2b9d416ed8315f23e9492baf993d`, Git tree `d13a99e6c47f2b3ea279c5d02da5cf15008807b7`, 138 tracked files, and deterministic tree-listing SHA-256 `79d543e6794f604af6c59cfe43928ac4b5e5fa578ba4559d354e6291cfe8f24c`.

The donor is authoritative for implementation facts because the user supplied it. It does not verify byte or history continuity with the older reported archive. The old archive checksum therefore remains unverified and must never be replaced by the Git tree hash.

## Frozen source inventory

Add `config/wisetech-authoritative-source-inventory.ts` as a checked-in evidence fixture. Continuous integration validates the fixture without cloning a remote repository or depending on a mutable branch.

The inventory records:

- the exact donor repository, commit, Git tree, tracked-file count, and tree-listing SHA-256;
- the two donor locales (`en` and `zh`) and their mapping to hkwtia's unprefixed English and `/zh` Traditional Chinese routes;
- all 67 sitemap paths and dispatcher-only route patterns;
- 35 mega-navigation and CTA targets;
- six physical forms representing nine logical flows;
- donor implementation components grouped by source file and disposition;
- bounded content collections and content-test counts;
- all 99 public assets with source path, category, SHA-256, disposition, rights status, relationship status, and English/Traditional-Chinese alt status.

The fixture is an evidence index, not copied runtime data. A future donor revision requires an explicit reconciliation pull request.

## Classification rules

Every source item receives exactly one disposition: `retain`, `merge`, `redirect`, or `retire`. Every non-retired route or CTA must resolve to a current hkwtia route, redirect, or existing Concierge action.

The validator fails when an item is missing, duplicated, unclassified, points to an unresolved destination, or collapses the two provenance identities. Asset publication fails closed: a donor asset cannot be publishable unless rights, relationship status where relevant, and bilingual alt-text status are approved.

Donor partner logos and names are historical source evidence only. They do not prove a current partner, sponsor, member, endorsement, relationship, or right to publish. Donor events, programme editions, metrics, testimonials, membership offers, portal preview state, and form submissions likewise remain non-authoritative until a current hkwtia owner verifies them.

## Route reconciliation

The current manifest already covers 61 of the donor's 67 sitemap paths. Add explicit source mappings for:

- `/events/asia-smart-innovation-awards-summit-2025` to the repository-owned `/events/[slug]` pattern as a historical reference only;
- `/events/smart-innovation-meets-genai` to `/events/[slug]` under the same publication boundary;
- `/programmes/tech-connect` to the typed `/programs/tct` record;
- `/programmes/asia-smart-innovation-awards` to the typed `/programs/asa` record;
- `/programmes/asia-smart-innovation-awards/2025` to `/programs/asa` as source evidence only, without manufacturing an edition;
- `/programmes/hkict-startup-award` to the typed `/programs/hkict` record.

Runtime-only `/search` remains retired. Donor portal previews map only where authenticated hkwtia authorities already exist; unsupported preview modules remain retired. The donor router, ChatGPT auth helpers, D1/Workers starter runtime, and mailto/local-state form implementations are not imported.

## Documentation and gates

Update the parity, provenance, content, component, asset, and delivery-gate documents and add a dedicated source-reconciliation record. They must distinguish:

- user-authorized Git source reconciliation: locally passed after deterministic validation;
- historical archive identity equivalence: unresolved;
- branch protection, isolated infrastructure, Preview/UAT, production approval, and the unsubscribe fallback: external gates that remain fail-closed.

Phase 0 source reconciliation is complete for the supplied Git donor only. The separate historical archive-equivalence question remains an explicit non-blocking provenance mismatch unless the old bytes are later supplied.

## Verification

Use test-driven development. Preserve failing RED output for each new contract, then run focused reconciliation/parity tests, full Vitest, string audit, lint, typecheck, build, and the production dependency audit. An independent reviewer must report zero Critical or Important findings before the supplement is pushed.
