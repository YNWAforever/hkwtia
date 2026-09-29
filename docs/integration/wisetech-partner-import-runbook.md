# WiseTech partner logo restoration

## Source and decision

The reviewed source is YNWAforever/wisetech commit
f91ecc5fa29c2b9d416ed8315f23e9492baf993d. It exports
supportingOrganisations, regionalPartners, and mediaPartners from
app/partnerData.ts; each row has name and file. The 79 PNGs live under
public/partners/{supporting,regional,media}/. Their counts are 58, 15, and 6.
On 2026-09-30 HKT the WTIA requester confirmed that all 79 organisations still
have current partner relationships and authorised WTIA to display their logos
in this Codex task. The 79 local donor PNGs matched the SHA-256 values in
config/wisetech-authoritative-source-inventory.ts; no other donor assets were
covered by that confirmation.

The inventory now marks those 79 assets' relationship and logo-rights evidence
approved and their disposition merge. Bilingual alt review and direct
publication remain separate. The archive photographs and branding assets retain
their previous gates. This decision is not evidence that records have been
imported, published, or displayed on the live site.

## Before importing

1. Confirm the target database. Use an isolated database first. Production
   requires a separate, explicit WISETECH_IMPORT_ALLOW_PRODUCTION=true.
2. Supply WISETECH_DONOR_DIR pointing at the exact donor checkout above.
   Compare its 79 files against the checked-in SHA-256 inventory before any
   production run. Do not substitute a different checkout or add unreviewed
   records.
3. Supply DATABASE_URL and working R2 configuration:
   R2_ACCOUNT_ID, R2_JURISDICTION, R2_ACCESS_KEY_ID,
   R2_SECRET_ACCESS_KEY, and R2_BUCKET. The importer fails before the
   loop if R2 configuration is missing. R2 uploads need isolated/test
   credentials for isolated acceptance.
4. Set WISETECH_PARTNER_IMPORT=true,
   WISETECH_IMPORT_ACTOR_PROFILE_ID=<your profiles.id>, and
   WISETECH_IMPORT_ACTOR_KIND=staff|exco|superadmin. The importer checks
   that the profile exists and its database role exactly matches the claimed
   role before writing. Use the actual operator's profile, never a placeholder.
5. Optional: WISETECH_PARTNER_ZH_NAMES_CSV points to a
   name_en,name_zh_hk CSV. Without a Chinese name, the English name remains
   the temporary name_zh_hk and must be reviewed in the CMS.

Run npm run content:import-wisetech-partners.

Success for the exact 79-row source means created + skippedExisting = 79 and
skippedError = 0. Any skipped error makes the command exit nonzero. Re-running
is idempotent on (category, name_en). R2 objects uploaded before a failed DB
transaction may remain; review and reconcile them before retrying.

## Confirm and publish

Import creates audited media and partner records with all three confirmation/
publication timestamps unset. No visitor can see them yet. For each record in
/admin/partners/[id], review the English and Chinese names and both alt
strings, set an accurate relationship window if known, record relationship and
logo-rights confirmations, then publish. The repository refuses publication
without both confirmations and a live logo media record with bilingual alt.
Do not infer start dates or indefinite historical grants from the donor file.

Verify /partners, /zh/partners, /, and /zh with all 79 records, including
all three homepage categories and working images. Capture counts, image errors,
and screenshots. A successful script run alone is not browser acceptance.

## Rollback

Unpublish affected records in the CMS first; public queries then stop returning
them. If needed, archive them after unpublishing. Preserve audit history and
uploaded R2 objects for reconciliation; do not delete them blindly. Rolling back
application code cannot undo published database content, so verify public counts
after both steps. This restoration requires no migration.

## Current release gate (2026-09-30)

Production partners has zero rows. vercel env ls production for the linked
hkwtia project lists no R2 configuration keys, and the accessible local
environments have no complete R2 configuration. Therefore the production import
and browser acceptance have not run. Configure the existing R2 storage for the
actual environment, then finish isolated import acceptance before a production
import. The exact code and read-only evidence are in
docs/integration/wisetech-partner-logo-restoration-2026-09-30.md.