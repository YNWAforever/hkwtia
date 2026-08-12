# Launch Safety Design

Migration sub-project 1 of 4. See `docs/wtia-content-migration-audit.md` for the
content audit this decomposes.

## Goal and acceptance boundary

WTIA is retiring `hkwtia.org` and pointing the domain at this application. Three
things must be true before that DNS change, and none of them are true today:

1. Nothing a visitor can reach is fictional. The deployed site currently serves
   demo showcase listings, a demo news post, a demo event and a demo Launch Pad
   cohort, all labelled 「虛構示範」.
2. No routine command can put fixture data into a live database again.
3. Twenty-five years of inbound links resolve. Government citations, press
   coverage in 明報 / 星島 / 大公報 / HK01 / RTHK, and search results all point at
   `hkwtia.org` URLs that will otherwise 404 the moment the domain moves.

This sub-project ships those three and nothing else. It deliberately does not
migrate content — the institutional history, programme records, media archive and
member stories are sub-projects 2 to 4. The boundary is drawn there because the
demo content is public *now*, and because the redirect map depends on a source
that is actively decaying.

Acceptance: a reviewed inventory shows no synthetic rows reachable on any public
surface; `npm run db:seed` cannot create fixture data; and every URL in the
captured legacy inventory has a declared, non-404 destination.

## Options considered

**Harden the individual seeds in place.** Rejected. M3, M5 and M6 each hand-roll
their own guard, and that duplication is precisely why M1/M2 never got one. A
fourth copy would leave the same failure mode available to the fifth seed.

**Delete the synthetic rows outright.** Rejected as the first step, kept as the
second. Deletion is correct eventually, but it is irreversible against a database
we cannot inspect from the repository, and the identifying markers are inferred
from seed source rather than a schema column. Hiding first costs one extra step
and makes a misidentification recoverable.

**Add a `synthetic` column to every seeded table.** Rejected. It is the cleanest
identification mechanism, but it requires a migration across a dozen tables and
backfilling it means solving the identification problem anyway.

## Architecture

### 1. Seed isolation

The hole is in the documented path, not an exotic one. `scripts/db-seed.ts` calls
`runM1Seed` then `runM2Seed`, and neither reads an authorization flag, a test
database URL, a host allowlist, or `VERCEL_ENV`. `npm run db:seed` is the command
AGENTS.md and the README both give as ordinary setup, and it writes 30
`.example.test` profiles, 12 companies and four events wherever `DATABASE_URL`
points. M5 and M6, by contrast, both refuse to run without an explicit flag, a
matching `DATABASE_URL_TEST` and a non-production environment, and M6
additionally requires an allowlisted database hostname.

The split follows what the data actually is. The M1 plan rows (`community`,
`startup`, `corporate`, `patron`) are real product configuration that every
environment needs; the M2 rows are fixtures. So:

- `db:seed` seeds M1 only, unguarded, idempotent, safe in production.
- `db:seed:demo` seeds M2, behind the guard.
- `scripts/lib/acceptance-guard.ts` becomes the single implementation, and M3, M5
  and M6 are refactored onto it. Their current behaviour is preserved exactly —
  M6 keeps its host allowlist, M3 keeps its expected-host check — so this is a
  consolidation, not a loosening.

`db-seed.ts` also discards the underlying error in its `catch` and prints only
"Database seed failed.", which turns a partial seed into a mystery. It should
report the cause, matching how `db-migrate.ts` already surfaces its failure.

A contract test asserts that every module under `scripts/seed-*.ts` other than
M1 routes through the shared guard, and that running the M1 seed alone produces
no row bearing a synthetic marker. The first assertion is what stops the sixth
seed from repeating this.

### 2. Synthetic content purge

The application cannot see the production database from the repository, so this
ships as read-only tooling plus an operator procedure — not an automated task.

`scripts/audit-synthetic-content.ts` runs read-only by default and prints an
inventory: table, row id, and which marker matched. The markers are enumerated,
never inferred at runtime:

- profile email domain `.example.test` (M2 and M3 identities)
- seed scope keys `m5-showcase-acceptance-v1` and `m6-launch-pad-acceptance-v1`
- the fixed stable ids the M2–M4 seeds use for immutable fixture rows

That inventory is reviewed by a human before anything mutates. It is also the
artifact that proves acceptance, so it belongs in the launch record alongside the
existing `docs/m*-acceptance.md` files.

Removal is two-phase:

**Phase A — hide.** Flip publication and approval state so no synthetic row is
publicly reachable: posts unpublished, showcase listings out of the published
status, events unpublished, cohorts out of the public status. Every public
surface already filters on these, so this takes effect on the next request and is
fully reversible. This is the step that closes the credibility risk.

**Phase B — delete.** Once Phase A is verified against the live site, delete the
rows. Requires an explicit flag distinct from the dry-run default, runs in one
transaction per table group, and writes `auditEvents` rows through the existing
repository so the removal is itself audited.

The risk this carries is a real member sharing a marker — a genuine company that
happens to hold a seeded id, or a staff account created at `.example.test`. The
dry-run review is the control, and Phase A's reversibility is the backstop. Phase
B should not run until Phase A has been live long enough to notice a mistake.

### 3. Legacy URL redirects

This section has a dependency that is failing now and a deadline set by someone
else, so its first step precedes everything above.

**Capture `hkwtia.org` before it goes dark.** Its `post-sitemap.xml`,
`page-sitemap.xml` and page bodies are the only source for the mapping, and the
site already returns intermittent Cloudflare 520s. Once the domain moves, the
mapping cannot be reconstructed. The same capture supplies the source content for
sub-projects 2–4, so it sits on the critical path twice and should be done first
and stored durably.

The inventory lands in `content/legacy-urls.json` as a committed fixture, which
makes the mapping reviewable in a pull request and testable without a network
call. Each entry is classified:

- **equivalent** — a page with a real counterpart (`/about-us/` → `/about`,
  `/chairmans-message/` → `/about/chairman`, `/certified-courses/` →
  `/programs/cpai`, `/contact-us/` → `/contact`).
- **section fallback** — a post with no per-item destination yet, redirected to
  the section that will hold it (`/2022/10/wtia-201st-anniversary…/` →
  `/about/history`).
- **gone** — content not migrating, answered deliberately rather than by
  accident.

Implementation is `redirects()` in `next.config.ts`, permanent for equivalents.
The file already carries four entries from an earlier rename, so the pattern and
its placement are established. WordPress date-path posts share a shape
(`/YYYY/MM/slug/`) and can be matched as a pattern rather than enumerated, but
the fixture still lists them so the tests can assert coverage.

Two tests: every entry in the fixture resolves to a declared destination, and
every destination is either a member of `publicRoutes` or an explicitly declared
external target. The second one is what stops a redirect pointing at a page that
does not exist.

**Sequencing consequence.** Milestone-post redirects have no target until
sub-project 2 builds `/about/history`. So this ships in two passes — pages and
programme URLs now, post URLs when their destination exists — and both passes
must be live before DNS moves. That ordering is a hard constraint on the whole
migration, not a preference.

## Invariants this must not break

- The guard consolidation must not weaken M3, M5 or M6. Each keeps its current
  required variables; the shared module is the union of their checks, applied per
  seed.
- `db:seed` must remain safe to run in production after the split, because the M1
  plan rows are real configuration and existing runbooks call it.
- The purge writes through `lib/db/repos/*` so authorization and audit rows
  behave as they do everywhere else. It does not open its own database client.
- No redirect may point at a route absent from `config/public-routes.ts`.
- Message bundles stay in parity and `npm run audit:strings` stays green; nothing
  here introduces visible strings.

## Out of scope

Content migration in every form: the 2001–2025 timeline, leadership rosters,
programme editions and winners, the news and media-coverage archive, the photo
gallery, and Meet Our Members as real showcase entries. Those are sub-projects 2
to 4 and each gets its own spec.

Also out of scope: the membership tier migration path for existing Platinum
members, and Launch Pad funding-scheme source attribution. Both are product
decisions from the audit's P2, independent of launch safety.
