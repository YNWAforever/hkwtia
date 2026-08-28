# WiseTech PR4 migration and import evidence

## Task 2 — announcements

Migration `drizzle/0019_wisetech_announcements.sql` is an additive definition of
`site_announcements`. It was generated from `lib/db/schema-core.ts` together
with `drizzle/meta/0019_snapshot.json` and journal index `19`.

This implementation did **not** execute the migration, inspect database rows,
seed/import content, or contact Neon or another provider.

### Forward checks

After an explicitly approved isolated migration, the operator can verify the
table and constraints without changing rows:

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'site_announcements'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.site_announcements'::regclass
ORDER BY conname;
```

### Data verification

These queries must return zero rows before any later public cutover. The two-argument `btrim`
uses a fixed character set matching JavaScript `String.prototype.trim()`; `btrim`, string
concatenation, and Unicode string literals are immutable PostgreSQL expressions.

```sql
SELECT id
FROM site_announcements
WHERE ends_at <= starts_at
   OR priority NOT BETWEEN 0 AND 1000
   OR char_length(btrim(title_en, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) NOT BETWEEN 1 AND 180
   OR char_length(btrim(title_zh_hk, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) NOT BETWEEN 1 AND 180
   OR char_length(btrim(cta_label_en, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) NOT BETWEEN 1 AND 60
   OR char_length(btrim(cta_label_zh_hk, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) NOT BETWEEN 1 AND 60;

SELECT id, href
FROM site_announcements
WHERE href NOT IN (
  '/', '/join', '/about', '/about/chairman', '/about/committees',
  '/about/history', '/membership', '/showcase', '/launchpad', '/ai-ops',
  '/events', '/news', '/programs/cpai', '/programs/hkict', '/programs/tct',
  '/programs/asa', '/contact', '/privacy', '/ai-transparency'
);
```

The active-selection contract is: unarchived, published no later than the
injected clock, `starts_at <= now < ends_at`, then priority descending,
`starts_at` descending, and id ascending, with a one-row limit.

### Zero-row import schema

No row accompanies PR4 Task 2. A later PR7 isolated-environment import must use
this reviewed header and supply real content-owner-approved values:

```csv
external_key,title_en,title_zh_hk,cta_label_en,cta_label_zh_hk,href,starts_at,ends_at,priority,publish
```

`external_key` belongs to the isolated import manifest and is not stored by
this migration. `publish` must be applied through the audited repository state
transition rather than inserted as an unaudited timestamp.

### Rollback boundary

Application rollback deploys the preceding application commit while retaining
the additive table and its rows. Destructive schema downgrade and row deletion
are not part of rollback. The public layout remains on `announcement={null}` in
PR4, so rolling back Task 2 does not require a public-content switch.

## Task 3 — general and Launch Pad partners

Migration `drizzle/0020_wisetech_partners.sql` additively creates the typed
`partners` authority and adds nullable `published_at` and `archived_at` to
`landing_partners`. It was generated with `drizzle/meta/0020_snapshot.json`
and journal index `20`.

This implementation did **not** execute the migration, inspect database rows,
seed/import partner content, or contact Neon, R2, Vercel, or another provider.

### Publication verification

Before a later public cutover, these queries must return zero rows. The bilingual-alt
checks use the same fixed Unicode whitespace set as JavaScript `String.prototype.trim()`.

```sql
SELECT p.id
FROM partners p
LEFT JOIN media m ON m.id = p.logo_media_id
WHERE p.published_at IS NOT NULL
  AND (p.published_at > CURRENT_TIMESTAMP
    OR p.archived_at IS NOT NULL
    OR p.relationship_confirmed_at IS NULL
    OR p.logo_rights_confirmed_at IS NULL
    OR m.id IS NULL OR m.archived_at IS NOT NULL
    OR char_length(btrim(m.alt_en, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0
    OR char_length(btrim(m.alt_zh, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0);

SELECT p.id
FROM partners p
WHERE p.published_at IS NOT NULL
  AND (p.relationship_starts_on > (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Hong_Kong')::date
    OR p.relationship_ends_on < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Hong_Kong')::date);

SELECT 'partner' AS authority, p.id, p.logo_media_id
FROM partners p
JOIN media m ON m.id = p.logo_media_id
WHERE m.archived_at IS NOT NULL
UNION ALL
SELECT 'showcase_listing' AS authority, s.id, s.logo_media_id
FROM showcase_listings s
JOIN media m ON m.id = s.logo_media_id
WHERE m.archived_at IS NOT NULL;

SELECT id
FROM landing_partners
WHERE published_at IS NOT NULL
  AND (archived_at IS NOT NULL OR mou_status <> 'signed');
```

The archived-media query covers both authorities that can attach a logo: general
`partners` and existing `showcase_listings`. Relationship start and end are inclusive
Hong Kong calendar dates. Both production and injected public projections enforce the
injected clock, the same bilingual-alt and date rules, requested-locale ordering, and a
caller bound of 1–100. The output omits general-partner internal state plus Launch Pad
`contact`, `notes`, and MOU negotiation state.

### Zero-row import schemas

No row accompanies PR4 Task 3. A later isolated import requires reviewed relationship,
logo-rights, bilingual-alt, and content-owner approval. Each authority has its own schema:

```csv
external_key,name_en,name_zh_hk,category,website_url,logo_external_key,display_order,featured,relationship_starts_on,relationship_ends_on,relationship_confirmed,logo_rights_confirmed,publish
```

```csv
external_key,organization_en,organization_zh_hk,market,region,mou_status,contact_json,notes,publish
```

The import must apply publication through the audited repositories, never by directly
inserting timestamps. `contact_json`, `notes`, and non-signed negotiation state remain
staff-only and must not appear in the public projection.

PR4 deliberately preserves `config/landing-partners.json` as the Launch Pad
runtime authority. PR5 must switch the public page to the bounded repository
projection and delete that static file in the **same atomic change**; a split
switch/delete is not an acceptable migration state.

### Rollback boundary

Application rollback deploys the preceding application commit while retaining
the additive schema and rows. Destructive schema downgrade and row deletion are
not rollback. Because PR4 makes no public cutover, rollback has no public data
source switch.

## Task 4 — secure media upload and delivery

Migration `drizzle/0021_wisetech_media_upload.sql` additively extends the existing
`media` registry with nullable private-object metadata. It was generated with
`drizzle/meta/0021_snapshot.json` and journal index `21`.

This implementation did **not** execute the migration, inspect database or object
rows, seed/import media, contact R2, or delete any provider object. Bucket
jurisdiction matching remains an external prerequisite.

### Forward and integrity verification

After an explicitly approved isolated migration, operators can inspect the
additive columns and checks without changing rows:

```sql
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'media'
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.media'::regclass
  AND conname LIKE 'media_upload_%'
ORDER BY conname;
```

The following query must return zero rows. It reports uploaded media with incomplete metadata,
a missing provider ETag, invalid checksum, invalid bounds,
or a browser URL that is not the row's own revocation-aware route:

```sql
SELECT id
FROM media
WHERE num_nonnulls(
  storage_key, storage_etag, original_filename, content_type, byte_size,
  width, height, focal_x, focal_y, checksum_sha256
) NOT IN (0, 10)
OR (storage_key IS NOT NULL AND (
  char_length(btrim(storage_etag, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')) = 0
  OR checksum_sha256 !~ '^[0-9a-f]{64}$'
  OR content_type NOT IN ('image/png', 'image/jpeg', 'image/webp')
  OR byte_size NOT BETWEEN 1 AND 4194304
  OR width NOT BETWEEN 1 AND 10000 OR height NOT BETWEEN 1 AND 10000
  OR width::bigint * height::bigint > 40000000
  OR focal_x NOT BETWEEN 0 AND 100 OR focal_y NOT BETWEEN 0 AND 100
  OR url <> '/api/media/' || id::text
));
```

Database SQL cannot prove private object bytes. Before a later cutover, an
explicitly authorized isolated application verification must issue an
ETag-bound GetObject for every uploaded row and report zero objects whose ETag,
exact length, content type, `sha256` object metadata, or streamed body digest
differs from the stored row. PR4 performs no provider read.

The archived-reference query in Task 3 remains authoritative across both
`partners` and `showcase_listings`; it must also return zero rows before an
archive/cutover. Uploading never weakens the transaction-held media-row locks on
either attachment path.

### Zero-row import schema

No file or row accompanies PR4 Task 4. A later PR7 isolated import may use only
this reviewed header after rights, bilingual-alt, and jurisdiction approval:

```csv
original_filename,alt_en,alt_zh,focal_x,focal_y,source_file
```

`source_file` is an isolated operator input and is never stored as a URL or
object key. Every row must pass through the actor-first upload endpoint,
normalization, private R2 Put, and same-transaction `media.uploaded` audit; a
CSV/database insert is not an upload substitute.

### Rollback boundary

Application rollback deploys the preceding application commit while retaining
the additive columns, rows, and private objects. Destructive schema downgrade,
object deletion, and garbage collection are not rollback. PR4 makes no public
content cutover; the own-origin GET route is revocation-aware delivery
infrastructure only.
