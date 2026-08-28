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
