# WiseTech PR4 CMS and Data Extensions Design

**Status:** review candidate v3
**Date:** 2026-08-28
**Base:** `codex/wisetech-pr3-institutional-pages` at `ddc4f18a4cace95cb46a21a6c49002627726783b`
**Target branch:** `codex/wisetech-pr4-cms-data`

## Outcome and boundary

PR4 adds the typed, audited authoring and storage foundations named by the master PR4 row: announcements, partners, secure media upload, and localized news bodies. It reuses the current Next.js App Router, Neon/Drizzle repositories, staff authorization, audit events, safe structured-content renderer, and own-origin image policy.

The word **partners** in the master PR4 row covers two deliberately separate owners:

- a new general partners/sponsors authority for future homepage and programme placements; and
- the existing Launch Pad `landing_partners` authority, which gains publication/archive state and staff management so PR5 can retire the duplicate static config safely.

This is data/CMS work, not a public-journey cutover. PR4 does not wire announcements, partner projections, Launch Pad records, or localized news bodies into public pages. The own-origin media GET route is storage delivery infrastructure required to preview and validate uploaded media; it does not alter public page composition.

This PR implements:

- persisted, scheduled bilingual announcements and staff lifecycle controls;
- general partner and Launch Pad partner staff lifecycle controls with safe future projections;
- a private Cloudflare R2 adapter, metadata-stripping raster upload pipeline, and revocation-aware own-origin delivery;
- verified upload metadata on the existing media registry;
- a Traditional Chinese news body alongside the existing English/legacy body, with CMS enforcement and no false translation backfill.

This PR explicitly does not:

- render announcements, partners, Launch Pad data, or localized news bodies on public pages;
- add event presentation fields or redesign Events; Site-evidenced event hero authoring and rendering move together in PR5;
- add or consume the membership catalog; PR5 introduces the shared public catalog read model and PR6 makes join/checkout consume it;
- add a general inquiry model, because every retained durable flow is already owned by Events, Cohorts, or Showcase leads;
- add a resource CMS, because the verified Site inventory does not promise a member resource hub;
- import the 79 donor partner records or any donor/demo content;
- run a migration or seed against any database;
- inspect, provision, or mutate R2, Neon, Vercel, Stripe, or other provider resources;
- deploy or merge.

## Evidence decisions

The authoritative Site v13 inventory is evidence of presentation and routes, not current content, relationship truth, or logo rights.

- Announcements, partners, secure upload, and localized news bodies are required by the master plan and form the exact PR4 implementation scope.
- Site v13 proves event imagery is useful, but the master PR row assigns public Events work to PR5. The optional event hero field, authoring control, and rendering therefore remain one reviewable PR5 slice.
- Site v13 does not prove independent event CTA state, registration windows, or event format. PR5 must derive CTA behavior from existing event registration, publication, membership, and capacity contracts.
- Donor partner enquiry, task enquiry, contact, host-activity, and footer-update forms are retired. Event registration, cohort application, and showcase introduction cover every retained durable flow, so no `inquiries` table is added.
- No verified resource-hub promise exists, so no resource table or empty public surface is added.
- Historical partner logos remain non-publishable until relationship, logo-rights, bilingual alt-text, and content-owner approval exist.

## Migration topology

PR4 uses four separate additive migrations after `0018_m7_archive.sql`, generated incrementally so each vertical slice has an independently reviewable schema snapshot and journal entry:

1. `0019_wisetech_announcements.sql`
2. `0020_wisetech_partners.sql`
3. `0021_wisetech_media_upload.sql`
4. `0022_wisetech_localized_news.sql`

Existing tables and columns are not removed or renamed. Each migration records forward checks, verification SQL, an application rollback boundary, and the fact that it was not executed by this PR. Application rollback deploys the preceding application commit while retaining additive schema and uploaded objects; destructive schema downgrade and object deletion are not part of rollback.

## Data model

### `site_announcements`

- `id uuid primary key default gen_random_uuid()`
- `title_en text not null`
- `title_zh_hk text not null`
- `cta_label_en text not null`
- `cta_label_zh_hk text not null`
- `href text not null`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `priority integer not null default 0`
- `published_at timestamptz null`
- `archived_at timestamptz null`
- `created_at`, `updated_at`

Constraints and repository validation require:

- `ends_at > starts_at`;
- titles of 1–180 Unicode characters and CTA labels of 1–60 characters after trimming;
- integer priority in `0..1000`;
- `href` to equal a code-owned canonical public path, with no HTML, external URL, protocol-relative URL, query, fragment, traversal, or redirect value.

Admin listing is capped at 100 rows. The future active projection returns at most one row for an injected clock: unarchived, published no later than `now`, `starts_at <= now < ends_at`, ordered by priority descending, start descending, and id ascending for determinism. PR4 implements and tests this projection but leaves the public layout on `announcement={null}`.

### `partners`

This authority is distinct from members and from private Launch Pad negotiations.

- `id uuid primary key default gen_random_uuid()`
- `name_en text not null`
- `name_zh_hk text not null`
- `category text not null`
- `website_url text null`
- `logo_media_id uuid null references media(id) on delete set null`
- `display_order integer not null default 0`
- `featured boolean not null default false`
- `relationship_starts_on date null`
- `relationship_ends_on date null`
- `relationship_confirmed_at timestamptz null`
- `logo_rights_confirmed_at timestamptz null`
- `published_at timestamptz null`
- `archived_at timestamptz null`
- `created_at`, `updated_at`

Typed categories are `supporting`, `media`, `regional`, `programme`, and `sponsor`. Names are limited to 160 characters and display order to `0..10000`. A new shared `lib/security/https-url.ts` helper owns website validation and is covered independently: input must already be trimmed, NFC-normalized, and `1..2048` characters; it rejects control and bidirectional-control characters, credentials, ports, query strings, fragments, IP literals, `localhost`, and non-HTTPS schemes; it returns canonical `URL.href` and never fetches the destination. Relationship end cannot precede start.

Publishing is rejected unless both confirmation timestamps are present and `logo_media_id` resolves to an unarchived media row with non-empty English and Traditional Chinese alt text. Partner create/update/publish and media archive lock the referenced media row in a consistent order, preventing a concurrent publication/reference from racing an archive.

The future public query defaults to 50 and accepts only limits `1..100`. It returns unarchived, published records with both confirmations and an active logo. Relationship dates are inclusive Hong Kong calendar dates derived from an injected clock: absent start/end is open-ended, otherwise `start <= today <= end`. Results are ordered by featured descending, display order ascending, localized name ascending, and id ascending. Only display-safe fields are exposed.

### Existing `landing_partners`

Add `published_at` and `archived_at` so a signed MOU is not silently equivalent to public approval. PR4 adds audited staff CRUD and a future projection capped at 100 rows. The projection requires signed MOU, publication, active state, and no archive, and omits `contact`, `notes`, and every negotiation-only field. PR5 switches Launch Pad from `config/landing-partners.json` to this repository and deletes the static authority in the same cutover.

### Existing `media`

Nullable fields preserve manual, tracked own-origin registry rows:

- `storage_key text unique null`
- `storage_etag text null`
- `original_filename text null`
- `content_type text null`
- `byte_size integer null`
- `width integer null`
- `height integer null`
- `focal_x integer null`
- `focal_y integer null`
- `checksum_sha256 text null`

For uploaded rows every field in this group is required, including a non-empty provider ETag. Checks require byte size in `1..4194304`, dimensions in `1..10000`, no more than 40,000,000 pixels, focal coordinates in `0..100`, and a lowercase 64-character SHA-256 digest. Existing registry-only rows keep all upload fields null.

The stored browser URL is `/api/media/<media-id>`. The R2 object URL and key are never exposed to the browser. Media archive remains reversible and never deletes the object, but it is rejected while any Showcase listing or general partner references the row. All code paths that attach those references lock the media row before committing, closing the archive/reference race.

### Existing `posts`

Keep existing `body_mdx` as the English/legacy body because `posts` also owns `buildlog` and `page` records. Add only nullable `body_mdx_zh_hk`.

The schema migration leaves `body_mdx_zh_hk` null for existing rows. It never writes English into a locale-labelled Chinese field. Verification SQL reports every news row missing a Chinese body; reviewed translations are supplied later through the CMS or the separately approved PR7 isolated import. PR5 must not enable Chinese-body public selection while any record it intends to publish lacks explicitly supplied and content-owner-approved Chinese text.

New and edited news records require both bodies. The established news action continues to persist English to `body_mdx` and persists Traditional Chinese to `body_mdx_zh_hk`; build logs and board pages are unaffected. PR4 does not modify `lib/db/repos/public-posts.ts`, the public news page, or locale selection, so both public locales retain their exact PR3 behavior. PR5 changes the public projection only after content approval.

## Repository and authorization model

Every staff repository method accepts `Actor` first and calls `requireAdmin(actor)` before validation or database loading. Every server action and upload route resolves and authorizes its actor before parsing form fields, URL parameters, or request bytes.

Mutations use one database transaction with row locking where prior or referenced state affects the result. The audit row is inserted in the same transaction:

- `announcement.created`, `announcement.updated`, `announcement.published`, `announcement.unpublished`, `announcement.archived`, `announcement.unarchived`
- `partner.created`, `partner.updated`, `partner.published`, `partner.unpublished`, `partner.archived`, `partner.unarchived`
- `landing_partner.created`, `landing_partner.updated`, `landing_partner.published`, `landing_partner.unpublished`, `landing_partner.archived`, `landing_partner.unarchived`
- `media.uploaded`
- existing news audit names remain unchanged, with changed-field metadata covering the Chinese body.

Publishing/unpublishing and archive/restore are explicit state transitions. Re-saving a published record preserves its publication instant. Announcement changes invalidate the future public root boundary without activating it. Landing-partner changes invalidate `/launchpad`; PR4 still leaves the page on its static source. Partner changes have no public consumer to invalidate. News actions retain established scoped invalidation without changing public selection.

## Admin surfaces

Add six guarded pages:

- `/[locale]/admin/announcements`
- `/[locale]/admin/announcements/[id]`
- `/[locale]/admin/partners`
- `/[locale]/admin/partners/[id]`
- `/[locale]/admin/landing-partners`
- `/[locale]/admin/landing-partners/[id]`

This raises the known admin-page inventory from 20 to 26. Add every page bidirectionally to navigation, route ownership, page-auth discovery, and bilingual visible-string coverage. Exact API/total route counts are updated from repository discovery rather than guessed in the plan.

Forms use the existing action-state pattern, localized labels, inline field errors, pending state, archive controls, and server-owned validation. Actions authorize before invoking pure parsing helpers.

The existing media create page gains a separate upload form; manual registration remains available. The news form changes from one body editor to English and Traditional Chinese editors. Both continue through `SafeStructuredContent`; no executable MDX feature is added.

## Secure media upload and delivery

### Ingress and normalization

`POST /api/admin/media/upload` accepts raw bytes. Small URL-encoded query parameters carry bilingual alt text, focal coordinates, and a bounded original filename. The filename must already be NFC-normalized and trimmed, contain `1..255` Unicode characters, and contain no slash, backslash, C0/C1 control, null, or bidirectional-control character. Each alt value must already be NFC-normalized and trimmed, contain `1..300` Unicode characters, and contain no C0/C1, null, or bidirectional-control character. This avoids framework multipart parsing before authorization.

The 4 MiB (`4,194,304` byte) application limit stays below Vercel Functions’ 4.5 MB request/response limit. The route rejects missing, malformed, non-integer, zero, or over-limit `Content-Length` before reading and enforces the same cap while streaming. The normalized output is independently required to remain within 4 MiB.

Checks execute in this order:

1. resolve and require a staff actor;
2. require exact same-origin `Origin` against the configured application origin;
3. validate `Content-Length` and stream into a bounded buffer;
4. validate the exact filename, bilingual alt-text, and focal-coordinate contracts;
5. allow declared `image/png`, `image/jpeg`, or `image/webp` only;
6. verify magic bytes agree with declared MIME;
7. decode once with `sharp` under the 40-million-pixel and single-frame limits; reject SVG, animation, malformed input, and dimensions outside `1..10000`;
8. auto-orient and re-encode to the same raster family with all EXIF, GPS, IPTC, XMP, comments, and other metadata stripped; verify the normalized output again and reject output over 4 MiB;
9. calculate SHA-256 over the normalized bytes;
10. generate a non-user-controlled key under `media/YYYY/MM/<uuid>.<ext>`;
11. upload normalized bytes to private R2 with verified content type, `Cache-Control: no-store`, and `sha256` object metadata; do not send an unsupported ordinary PutObject full-object SHA-256 checksum header;
12. require a provider ETag, then insert the media row and audit event in one database transaction;
13. if ETag validation or the database transaction fails, best-effort delete the uploaded object and return a generic error.

Tests include a fixture carrying EXIF/GPS data and prove none survives the normalized output.

### R2 configuration

The adapter is server-only and lazy. It uses `@aws-sdk/client-s3`, region `auto`, and these required-on-use variables:

- `R2_ACCOUNT_ID`
- `R2_JURISDICTION`, exactly one of `default`, `eu`, `us`, or `fedramp`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET`

The endpoint is generated, never accepted as an arbitrary URL:

- `default` -> `https://<account-id>.r2.cloudflarestorage.com`
- jurisdiction value -> `https://<account-id>.<jurisdiction>.r2.cloudflarestorage.com`

Account ID, bucket, credentials, and jurisdiction are validated without logging their values. Missing/malformed configuration fails only attempted upload/read; import and production build remain safe without credentials. `NEXT_PUBLIC_R2_PUBLIC_URL` is not used. Matching the configured jurisdiction to the existing bucket is an external provider prerequisite because PR4 is not authorized to inspect or mutate R2.

### Delivery and revocation

`GET /api/media/[id]` validates a UUID, loads an unarchived uploaded media row, and issues a streamed R2 `GetObject` with `IfMatch` equal to the required stored ETag. It rejects or maps to 404 any provider precondition failure, missing body, changed ETag, changed length, changed content type, or mismatched `sha256` object metadata. It never exposes provider error detail.

Successful responses stream the bounded object with verified `Content-Type`, exact `Content-Length`, stored ETag, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, and exactly `Content-Disposition: inline` with no filename parameter. The staff-only original filename is never emitted. `no-store` makes the archive promise honest: every subsequent request rechecks database state, and an archived record returns 404. Tests cover a successful read, overwrite/integrity mismatch, provider failure, and before/after archive behavior.

The browser sees only the application origin, so the existing `img-src 'self' data:` CSP and empty Next remote-image allowlist remain intact. Object deletion/garbage collection is a separately approved operational task.

## Migration, import, and rollback evidence

PR4 commits generated SQL/snapshots/journal entries, verification SQL, a zero-row import schema, and application rollback notes. It does not execute a migration or inspect rows.

Verification queries cover:

- invalid announcement windows, priority, or canonical hrefs;
- published partners without confirmations, current relationship, bilingual names, or active bilingual-alt media;
- uploaded media with incomplete metadata, missing ETag, invalid checksum, or inconsistent object metadata;
- media archive attempts while referenced by Showcase or partners;
- news rows missing a Chinese body; content approval remains an explicit PR5/PR7 gate rather than being inferred from string equality;
- published landing partners outside signed/active state.

Real announcements, partners, landing partners, media, and news content remain a PR7 isolated-environment import after content, rights, relationship, and bilingual approval.

## Testing and acceptance

TDD is required per vertical slice. Focused tests cover schema and generated migration contracts; deny-before-parse/load authorization; transaction-coupled audit state; explicit bounds; Hong Kong date semantics; the shared HTTPS policy; public-field privacy; media-reference locking; upload normalization and metadata removal; R2 configuration/jurisdiction; ETag-bound streamed delivery; news null migration/CMS behavior; route ownership; and bilingual visible strings.

Final local verification runs focused suites, full visible-string audit, full unit/integration suite, lint, typecheck, production build, high-severity dependency audit, and credential-free browser guards. Migration execution, real R2 upload/read, authenticated admin E2E, isolated Preview/database, Lighthouse, content/rights review, and provider-jurisdiction checks are external gates and are reported separately.

PR4 is ready for review when all four master-row capabilities exist without public cutover; the excluded event, membership, inquiry, and resource work is pinned to its later owner; no donor/demo row is imported; all available checks pass; and unavailable external gates are named rather than implied.
