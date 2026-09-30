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

Verify /partners and /zh/partners with all 79 records. On / and /zh, verify all
three category counts (58/15/6) and the existing preview of up to 12 logos per
selected tab. Check working images, capture counts and image errors, and save
screenshots. A successful script run alone is not browser acceptance.

## Rollback

Unpublish affected records in the CMS first; public queries then stop returning
them. If needed, archive them after unpublishing. Preserve audit history and
uploaded R2 objects for reconciliation; do not delete them blindly. Rolling back
application code cannot undo published database content, so verify public counts
after both steps. This restoration requires no migration.

## Current release gate (2026-09-30)

Production partners has zero rows. vercel env ls production for the linked
hkwtia project lists no R2 configuration keys. At the initial check, accessible local
environments have no complete R2 configuration. Therefore the production import
and browser acceptance have not run. Configure the existing R2 storage for the
actual environment, then finish isolated import acceptance before a production
import. The exact code and read-only evidence are in
docs/integration/wisetech-partner-logo-restoration-2026-09-30.md.
## Isolated SQL verification completed

The follow-up test on the API-confirmed, non-default Neon acceptance branch
passed using 79 synthetic records, real PNG normalization and the CLI's shared
SQL adapter. It proved sequential rerun idempotency, unpublished defaults,
transactional audit rollback and stored-actor role refusal. Its R2 upload port
was a mock. Actual R2 upload/read acceptance is still required before the
production import. Exact commands, mutation proof and run-owned cleanup counts
are in the linked restoration evidence above.

## R2 provisioning follow-up

The requester supplied all five settings in the ignored local test env file.
Their format passed, but the exact test bucket
`hkwtia-partner-acceptance-20260930` did not exist: synthetic PUT/DELETE returned
`404 NoSuchBucket`. The requester confirmed it had not been created. Creating
that bucket with the same credential returned `403 AccessDenied`.

Create the private bucket through the matching Cloudflare account's R2
dashboard, using default jurisdiction and Standard storage. Keep existing
object-read/write credentials in the ignored test env file. Run the synthetic
PUT/GET/SHA-256/delete probe before any 79-row import; its current result is
failed, not provider acceptance. Full attempt details and exact commands are
in the linked restoration evidence. No test credential has been sent to Vercel,
and no production data or configuration was changed in this follow-up.

## Provisioning resolved and actual isolated acceptance

The requester created the named private test bucket. The real synthetic R2
PUT/GET/checksum/dimension/delete probe subsequently passed. The exact approved
79-logo source then passed real R2 + isolated Neon import/read verification and
an idempotent rerun. Existing publication guards refused unconfirmed rows;
existing repository methods and a real synthetic staff CMS browser unpublish/
republish journey passed. The 8 bilingual desktop/mobile public route cases
passed with all 79 directory images decoded. See the linked restoration report
and its checksum-indexed evidence package for the exact commands and failures.

Vercel Preview acceptance remains next. Retained fixture data is confined to the
confirmed isolated branch/private bucket; cleanup is pending remote acceptance.
Configure only the Preview deployment's test database/auth/Stripe/R2 settings,
then verify its 79 actual media responses and bilingual views. Production
configuration and data publication still need their actual environment and
release authority; the local pass does not authorise a production migration or
import. There is no schema change or new worker rollout for this restoration.

## Latest Preview acceptance and Production gate: 2026-10-01 HKT

Explicit R2 test-to-Vercel authorization was received. The clean 68faa7be
Preview dpl_qpvHQDcsMY2MxR9B1wbrg4AD9Rfg is READY at
https://hkwtia-partner-logos-20260930.vercel.app. All 8 bilingual desktop/mobile
cases passed with 79 real directory images decoded. Exact isolated Auth origin
configuration resolved a reproduced INVALID_ORIGIN; real synthetic staff CMS
login/protection and public unpublish/republish counts 78/79 passed. Full evidence
and screenshots are in the restoration report and its SHA-indexed package.

Production remains ab568934. A fresh names-only check shows four R2 settings,
but R2_BUCKET is absent; their values and capability are unverified. Do not
promote this test-env deployment. After separate actual Production authority,
complete Production storage configuration, guarded unpublished import, CMS
bilingual review/confirmation/publication and live browser acceptance. There is
no migration or new worker. Rollback unpublishes scoped content before optional
archive/web rollback and retains audits/objects. No Production rollback has run.

Test fixtures remain for Preview review, not a full cleanup claim. The branch
expires 2026-10-04 20:00 HKT. After review, tear down only this owned Preview alias,
deployment and exact isolated Auth trusted origin, then reconcile/remove only
its recorded run-owned rows/objects. The existing rollback-only SQL rehearsal
and synthetic object DELETE passed; full fixture cleanup is still pending.
