# WiseTech Partner Import — Staff Runbook

This runbook covers running `scripts/import-wisetech-partners.ts` and confirming rights for the imported records. It does not cover archive photography (see §3) or writing the script itself (see `docs/superpowers/plans/2026-09-05-wisetech-wp5-content-migration.md`).

## 1. Before you run anything

The script refuses to run without:

- `WISETECH_PARTNER_IMPORT=true`
- `WISETECH_IMPORT_ACTOR_PROFILE_ID=<your profiles.id>` — every row this run creates is attributed to this profile in `audit_events`. Use your own profile id, not a shared or placeholder one.
- `WISETECH_IMPORT_ACTOR_KIND` — one of `staff`, `exco`, `superadmin` (defaults to `staff` if unset).
- Either the target database has a real `acceptance_sentinel` row (a disposable database provisioned for this purpose), **or** you explicitly set `WISETECH_IMPORT_ALLOW_PRODUCTION=true`. Only set this against the real production database once you have actually decided to import the real records there — there is no dry-run mode.
- `WISETECH_DONOR_DIR=<path to the donor checkout>` — must contain the donor's partner data file and `public/partners/**` logo files.
- `DATABASE_URL=<the target database>`.

Optional: `WISETECH_PARTNER_ZH_NAMES_CSV=<path to a name_en,name_zh_hk CSV>` — supply Chinese names for as many partners as you have them for. Any partner not listed keeps its English name as a placeholder `name_zh_hk` until you edit it in `/admin/partners`.

## 2. Running the import

```sh
npm run content:import-wisetech-partners
```

The script prints only a running count (`created=N skippedExisting=N skippedError=N`) — never a partner name, a URL, or a secret. Every created row is a real, insertable, but **unpublished and unconfirmed** partner: no visitor can see it yet, and the repo (`lib/db/repos/partners.ts`) refuses to publish it until both confirmations below exist.

Running the script again against the same donor data is safe — it detects existing `(category, name_en)` pairs and creates nothing for them.

## 3. Confirming rights, per partner

For each newly-imported partner, in `/admin/partners/[id]`:

1. Confirm the **relationship window** — when this organisation was (or still is) a real WTIA partner. Set `relationshipStartsOn`/`relationshipEndsOn` if the relationship has a known end date; leave `relationshipEndsOn` unset if it's ongoing.
2. Confirm the **logo rights** — that WTIA is authorised to display this organisation's logo on the public site. This is a real legal/relationship confirmation, not a formality — do not confirm it without actually checking.
3. Once both are confirmed, the **Publish** action becomes available. Publishing is what makes the partner visible on `/partners` and the homepage wall.

Archive photography (the six donor `.webp` files, currently `retire` in `config/wisetech-authoritative-source-inventory.ts`) follows the same rights-confirmation principle but a different mechanism: once you've confirmed usage rights for one of those photos, upload it directly via `/admin/media` (bilingual alt text required) and reference it from the relevant page copy. There is no import script for this — `/admin/media` is already the correct, existing upload path.

## 4. After rights are confirmed for an asset

If you've confirmed rights for a specific archive photo or a class of partner logos such that `config/wisetech-authoritative-source-inventory.ts`'s disposition for that asset should change from `retire` to `merge`, that change:

- happens in its own commit,
- names the confirmation reference (who confirmed, when, and how) in the commit message,
- is reviewed like any other code change.

This runbook does not perform that step — it is a deliberate, one-at-a-time decision, not something the import script or this document should ever do automatically.
