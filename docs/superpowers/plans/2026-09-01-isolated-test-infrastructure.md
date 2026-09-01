# Isolated Test Infrastructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "this database is disposable" a property the code verifies, then provision the isolated Neon branch, test identities and Stripe test-mode configuration that delivery gate 2 requires.

**Architecture:** A sentinel row, planted deliberately at provisioning time, that the seed guard refuses to run without. Because the existing guard is synchronous and does no I/O, the sentinel check is a **separate async function in the same module**, called by each seed immediately after the sync guard — additive, leaving the existing contract and its tests untouched.

**Tech Stack:** TypeScript, Drizzle, Neon Postgres, Vitest, Stripe test mode.

**Design:** `docs/superpowers/specs/2026-09-01-isolated-test-infrastructure-design.md`, commit `50b1791`.

---

## Before you start

**Tasks 6, 8 and 9 are human gates.** Provisioning a Neon branch, creating test identities and obtaining Stripe test-mode keys cannot be automated from here and must not be attempted. Stop and hand over.

**No credential value is ever committed.** `.env.example` carries names only. Real values live in `.env.local` and the Vercel project settings.

**Never point any command at production.** Every seed and migration here targets the isolated branch only. If `DATABASE_URL` is not the isolated branch, stop.

**The down path does not exist.** All 23 existing migrations are forward-only and `scripts/db-migrate.ts` has no reverse. For the test branch, the reversal is to discard the branch and cut a new one. Do not write a down migration; do not report the down path as tested.

## File structure

| Path | Action | Responsibility |
|---|---|---|
| `drizzle/0024_acceptance_sentinel.sql` | Create | The single-row marker table |
| `scripts/lib/acceptance-guard.ts` | Modify | Add `assertSeedSentinel`; leave `assertIsolatedSeedEnvironment` untouched |
| `tests/unit/acceptance-guard.test.ts` | Modify | Cover the new function, including that it rejects |
| `.env.example` | Modify | Add the missing names |
| `docs/integration/isolated-test-infrastructure-evidence.md` | Create | Record what was provisioned and what was observed |

## Rollback

**Code:** `git revert` the commits; the migration is additive and its table is unused by application code.
**Test branch:** discard the Neon branch. That is the reversal, and it is why no down migration is needed here.

---

### Task 1: Verify preconditions

**Files:** none modified.

- [ ] **Step 1: Confirm the branch and base**

```bash
git rev-parse --abbrev-ref HEAD
git rev-parse origin/main
```

Expected: `feat/isolated-test-infrastructure`, and `origin/main` at `96e9e84cc7eaf04d34f357a8bbc7274c90c9f53d`.

- [ ] **Step 2: Confirm the five migrations are present**

```bash
ls drizzle/ | grep -E '^0019|^002[0-3]'
```

Expected: `0019_wisetech_announcements.sql`, `0020_wisetech_partners.sql`, `0021_wisetech_media_upload.sql`, `0022_wisetech_localized_news.sql`, `0023_wisetech_event_hero.sql`.

- [ ] **Step 3: Confirm the guard's current shape**

```bash
grep -n 'export function assertIsolatedSeedEnvironment' scripts/lib/acceptance-guard.ts
grep -l 'acceptance-guard' scripts/seed-*.ts
```

Expected: the function exists and is synchronous; the seeds for demo, m2, m3, m4a, m4b, m4c, m5 and m6 all import the module. If one does not, it has its own guard — record it and stop rather than guessing.

---

### Task 2: Write the failing test for the sentinel

TDD: the test comes first and is watched failing, per `AGENTS.md`.

**Files:**
- Modify: `tests/unit/acceptance-guard.test.ts`

- [ ] **Step 1: Add the test**

Add `assertSeedSentinel` to the existing import from `@/scripts/lib/acceptance-guard`, then append:

```ts
describe("seed sentinel", () => {
  it("rejects a database with no sentinel row", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => 0),
    ).rejects.toThrow("M5_ACCEPTANCE_SENTINEL_REQUIRED");
  });

  it("accepts a database whose sentinel is present", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => 1),
    ).resolves.toBeUndefined();
  });

  // More than one row means something other than provisioning wrote to the
  // table, so the marker no longer evidences a single deliberate act.
  it("rejects a sentinel table with more than one row", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => 2),
    ).rejects.toThrow("M5_ACCEPTANCE_SENTINEL_AMBIGUOUS");
  });

  it("surfaces a query failure rather than treating it as absence", async () => {
    await expect(
      assertSeedSentinel("M5_ACCEPTANCE", async () => {
        throw new Error('relation "acceptance_sentinel" does not exist');
      }),
    ).rejects.toThrow("M5_ACCEPTANCE_SENTINEL_UNREADABLE");
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
npm test -- tests/unit/acceptance-guard.test.ts
```

Expected: **FAIL** — `assertSeedSentinel` is not exported. Quote the failure; it is the RED evidence.

---

### Task 3: Implement the sentinel check

**Files:**
- Modify: `scripts/lib/acceptance-guard.ts`

- [ ] **Step 1: Add the function**

Append to `scripts/lib/acceptance-guard.ts`, leaving `assertIsolatedSeedEnvironment` exactly as it is:

```ts
/**
 * The existing guard checks a name; this checks a property.
 *
 * `assertIsolatedSeedEnvironment` already notes that an allowlisted host is not
 * proof of isolation and that the operator still has to confirm it. This is that
 * confirmation, made checkable: provisioning plants one row in
 * `acceptance_sentinel`, and a database without it cannot be seeded. Production
 * never has one, because nobody would plant it there.
 *
 * Takes a count function rather than a client so the seeds can pass their own
 * connection and the tests can pass a stub. An unreadable table is its own
 * failure, distinct from an absent row -- a missing relation must not be read as
 * "no sentinel, therefore refuse for the ordinary reason", because the two are
 * fixed differently.
 */
export async function assertSeedSentinel(
  prefix: string,
  countSentinelRows: () => Promise<number>,
): Promise<void> {
  const fail = (code: string): never => {
    throw new Error(`${prefix}_${code}`);
  };

  let rows: number;
  try {
    rows = await countSentinelRows();
  } catch {
    fail("SENTINEL_UNREADABLE");
    return;
  }

  if (rows === 0) fail("SENTINEL_REQUIRED");
  if (rows > 1) fail("SENTINEL_AMBIGUOUS");
}
```

- [ ] **Step 2: Run the test and watch it pass**

```bash
npm test -- tests/unit/acceptance-guard.test.ts
```

Expected: all pass, including the four new cases.

- [ ] **Step 3: Wire it into `seed-m5.ts`**

Without this the function guards nothing, and Task 10's verification cannot pass.

Open `scripts/seed-m5.ts` and find the existing `assertIsolatedSeedEnvironment` call (around line 90, using `flag: M5_ACCEPTANCE_SEED_ENV`). Immediately after it, once a database connection is available, add:

```ts
await assertSeedSentinel("M5_ACCEPTANCE", async () => {
  const {rows} = await client.query<{count: string}>(
    "SELECT count(*)::text AS count FROM acceptance_sentinel",
  );
  return Number(rows[0]?.count ?? 0);
});
```

Use whatever client variable that file already holds — do not open a second connection. Add `assertSeedSentinel` to its existing import from `./lib/acceptance-guard.ts`.

If the seed's structure makes this awkward — for instance if the guard runs before any connection exists — **stop and report** rather than restructuring the seed. Where the call belongs is a design decision, not a mechanical one.

`seed-m5.ts` is wired first because Task 10 verifies through it. The other seven seeds follow once the shape is proven; that is named in "What this plan does not do".

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

This will fail on untracked scratch directories such as `task9-root-stage/`, which are pre-existing and unrelated. Confirm no error names `acceptance-guard.ts`, `acceptance-guard.test.ts` or `seed-m5.ts`; if none does, treat it as passing for this change and record the limitation.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/acceptance-guard.ts tests/unit/acceptance-guard.test.ts scripts/seed-m5.ts
git commit -m "feat: add a seed sentinel that proves a database is designated disposable"
```

---

### Task 4: Add the sentinel migration

**Files:**
- Create: `drizzle/0024_acceptance_sentinel.sql`

- [ ] **Step 1: Write the migration**

```sql
-- The marker that makes "this database is disposable" checkable rather than
-- asserted. Planted once at provisioning; read by assertSeedSentinel before any
-- fixture seed runs. Production never receives one.
CREATE TABLE IF NOT EXISTS acceptance_sentinel (
  id boolean PRIMARY KEY DEFAULT true,
  designated_at timestamptz NOT NULL DEFAULT now(),
  designated_by text NOT NULL,
  note text,
  CONSTRAINT acceptance_sentinel_single_row CHECK (id)
);
```

The boolean primary key with `CHECK (id)` permits exactly one row: a second insert collides on the key rather than relying on convention.

- [ ] **Step 2: Register it the supported way**

`AGENTS.md` and `docs/wisetech-merge-rules.md` both forbid hand-editing generated SQL and metadata, which includes `drizzle/meta/_journal.json`.

If this migration cannot be adopted without hand-editing the journal, **stop and report**. Adding the table to the Drizzle schema and regenerating is the supported path, but it changes `lib/db/schema-core.ts` and is a decision for the owner rather than this plan.

- [ ] **Step 3: Commit**

```bash
git add drizzle/
git commit -m "feat: add the acceptance sentinel table"
```

---

### Task 5: Complete the environment inventory

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add the missing names**

Append, names only, no values, matching the file's existing style:

```
M5_ACCEPTANCE_EMAIL=
M5_ACCEPTANCE_PASSWORD=
M6_TEST_MEMBER_EMAIL=
M6_TEST_MEMBER_PASSWORD=
M6_TEST_STAFF_EMAIL=
M6_TEST_STAFF_PASSWORD=
M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST=
```

- [ ] **Step 2: Confirm no value was committed**

```bash
git diff .env.example
```

Expected: every added line ends in `=` with nothing after it.

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: declare the acceptance variables the seeds already require"
```

---

### Task 6: GATE — provision the Neon branch

**This is a human action. Stop and hand over.**

Create a Neon branch from production. Production is pre-launch and holds no real member data, which is why branching it is acceptable — if that has changed, stop and revisit the design.

Record the branch name and its pooled connection host. Put the connection string in `.env.local` as **both** `DATABASE_URL` and `DATABASE_URL_TEST`: the guard requires them equal and fails `DATABASE_URL_MISMATCH` otherwise. Set `M6_ACCEPTANCE_DATABASE_HOST_ALLOWLIST` to that exact hostname.

Never commit any of these values.

- [ ] **Step 1: Hand off and wait for confirmation that the branch exists**

---

### Task 7: Apply the migrations to the branch

The first time migrations `0019`–`0024` run anywhere.

**Files:** none modified.

- [ ] **Step 1: Confirm the target is the isolated branch, not production**

```bash
node -e 'console.log("host:", new URL(process.env.DATABASE_URL).hostname)'
```

Compare against the branch host recorded in Task 6. **If it does not match, stop.**

- [ ] **Step 2: Migrate**

```bash
npm run db:migrate
```

Expected: exits 0, applying `0019_wisetech_announcements`, `0020_wisetech_partners`, `0021_wisetech_media_upload`, `0022_wisetech_localized_news`, `0023_wisetech_event_hero` and `0024_acceptance_sentinel`.

Record the output. If any migration fails, the branch has inherited schema drift from production — record the error and stop. That is a finding, not something to work around.

- [ ] **Step 3: No down-path test**

Do not attempt one. The repository has no down migrations and no reverse tooling. The reversal for this branch is to discard it. Record that explicitly in Task 12 rather than leaving D5's requirement looking satisfied.

---

### Task 8: GATE — test identities and Stripe test mode

**This is a human action. Stop and hand over.**

Create Neon Auth **test-only** accounts for the staff, member and company-admin roles, and set the matching variables in `.env.local`: `M2_TEST_*`, `M3_TEST_*`, `M5_ACCEPTANCE_EMAIL`/`_PASSWORD`, `M6_TEST_MEMBER_*`, `M6_TEST_STAFF_*`.

Obtain Stripe **test-mode** values for `STRIPE_TEST_SECRET_KEY`, `STRIPE_TEST_WEBHOOK_SECRET`, `STRIPE_TEST_STARTUP_PRICE_ID` and `STRIPE_TEST_CORPORATE_PRICE_ID`. Production Stripe variables stay separate and untouched.

Never reuse a production credential. Never commit a value.

- [ ] **Step 1: Hand off and wait for confirmation**

---

### Task 9: GATE — plant the sentinel

**This is a human action, and it is the one that authorises destruction.** Planting a sentinel in the wrong database authorises the seeds to write there.

Against the isolated branch only:

```sql
INSERT INTO acceptance_sentinel (designated_by, note)
VALUES ('<who designated it>', '<branch name and why>');
```

- [ ] **Step 1: Hand off, then verify exactly one row exists**

```sql
SELECT count(*) FROM acceptance_sentinel;
```

Expected: `1`.

---

### Task 10: Verify the sentinel actually blocks

A guard that has never rejected anything is a claim, not evidence.

**Files:** none modified.

- [ ] **Step 1: Observe a refusal against a database without a marker**

Point `DATABASE_URL` and `DATABASE_URL_TEST` at a second, empty Neon branch with no sentinel, then run a guarded seed:

```bash
npm run db:seed:m5
```

Expected: **fails** with `M5_ACCEPTANCE_SENTINEL_REQUIRED`. Quote it verbatim.

If it succeeds, the sentinel is not wired into that seed — stop, and do not proceed with a guard that does not guard.

- [ ] **Step 2: Confirm the same seed succeeds against the designated branch**

Restore the isolated branch's connection string, then run the same command. Expected: exits 0.

The pair matters more than either alone: it shows the guard distinguishes the two cases rather than failing or passing unconditionally.

---

### Task 11: Run an acceptance suite that previously skipped

**Files:** none modified.

- [ ] **Step 1: Run the M5 suites**

```bash
npm test -- tests/unit/m5-seed.test.ts
npm run test:e2e -- tests/e2e/m5-showcase.spec.ts
```

Expected: the credential-gated cases now **execute** rather than skip. Record how many ran that previously skipped — that count is the evidence gate 2 is closed.

If they still skip, a variable is missing; the skip message names which.

---

### Task 12: Record the evidence and open the pull request

**Files:**
- Create: `docs/integration/isolated-test-infrastructure-evidence.md`

- [ ] **Step 1: Write the record**

Include the Neon branch name and host (no connection string); the `db:migrate` output showing all six migrations applied; the verbatim `SENTINEL_REQUIRED` refusal and the successful run against the designated branch; which acceptance cases now execute and how many previously skipped; and which identities and Stripe test values were provisioned, **by name only**.

State plainly that the down path was **not** tested, because the repository has no down migrations; that the reversal for this branch is to discard it; and that applying these migrations to production would have no schema rollback — a decision owed before the cutover.

State that this closes delivery gate 2, and that gates 3 and 4 remain `NOT PASSED`.

- [ ] **Step 2: Ask the owner, then commit and open the pull request**

```bash
git add docs/integration/isolated-test-infrastructure-evidence.md
git commit -m "docs: record the isolated test infrastructure evidence"
git push -u origin feat/isolated-test-infrastructure
gh pr create --base main --head feat/isolated-test-infrastructure \
  --title "feat: isolated test infrastructure and the seed sentinel"
```

Confirm the base is `main`, not `release` — `release` is the repository default, so a wrong base is silent and would target production.

---

## What this plan does not do

- **No migration is applied to production.** Only the isolated branch.
- **No down path is created or tested.** The repository has none; the reversal is discarding the branch.
- **No credential enters the repository.** `.env.example` gains names only.
- **The seeds are not individually rewired.** `assertSeedSentinel` is added and proven through one seed; extending the call to the remaining seeds is follow-on work once the shape is confirmed.
- **Gates 3 and 4 are untouched** — Preview/UAT and production approval.
- **PR 7's content migration is not started**, though this unblocks it.
