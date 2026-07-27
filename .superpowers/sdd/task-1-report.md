# M4A Task 1 Report: AI schema and configuration

## Implementation summary

- Added the approved Vercel AI SDK dependencies: `ai`, `@ai-sdk/openai`, and `@ai-sdk/anthropic`.
- Added credential-free AI environment parsing. `AGENTS_ENABLED` is true only for the exact string `"true"`; Concierge defaults to `openai:gpt-4.1-mini`; provider-qualified model names are parsed as `<provider>:<model-id>`.
- Added durable Drizzle tables for `kb_documents`, `conversations`, `messages`, and `agent_runs`, including pgvector `vector(1536)`, JSON metadata/citations, lifecycle timestamps, CSAT 1–5 constraint, ownership/query indexes, provider-message idempotency, and retention indexes.
- Made `staff_tasks.profile_id` nullable and added the typed, defaulted JSON `context` containing only the five approved optional keys.
- Generated migration `0010_m4a_ai_concierge`, journal entry, and snapshot. Inspected SQL and manually added `CREATE EXTENSION IF NOT EXISTS vector` before the vector column. Existing staff tasks receive `context jsonb DEFAULT '{}'::jsonb NOT NULL`.

## Files changed

- `package.json`, `package-lock.json`
- `.env.example`
- `lib/config/env.ts`
- `lib/db/schema-core.ts`
- `drizzle/0010_m4a_ai_concierge.sql`
- `drizzle/meta/_journal.json`, `drizzle/meta/0010_snapshot.json`
- `tests/unit/ai-model.test.ts`
- `tests/unit/schema-contract.test.ts`, `tests/unit/env-contract.test.ts`

`lib/db/schema.ts` and `lib/db/server-schema.ts` already re-export `schema-core.ts` wholesale, so the new tables are exposed through both boundaries without redundant edits.

## RED evidence

Command:

```powershell
npm.cmd test -- tests/unit/ai-model.test.ts tests/unit/schema-contract.test.ts
```

Result: failed as intended before production implementation: 2 files failed; 11 failed, 4 passed.

Expected missing-feature evidence included:

```text
expected undefined to be true
parseAgentModel is not a function
expected undefined to be defined
Cannot read properties of undefined (reading 'channel')
```

These failures corresponded to absent AI configuration/model parsing, absent M4A tables, and absent `staff_tasks.context`.

## GREEN evidence

Command:

```powershell
npm.cmd test -- tests/unit/ai-model.test.ts tests/unit/schema-contract.test.ts
```

Result:

```text
Test Files  2 passed (2)
Tests       15 passed (15)
```

## Verification

```powershell
npm.cmd run typecheck
```

Result: passed (`tsc --noEmit`, exit 0).

```powershell
npm.cmd test
```

Result: completed successfully (exit 0) in the credential-free default configuration. A concise rerun with `npm.cmd test -- --reporter=dot` also completed successfully.

Migration inspection confirmed:

- `CREATE EXTENSION IF NOT EXISTS vector` appears before `CREATE TABLE "kb_documents"` and its `vector(1536)` column.
- `messages_provider_message_id_unique` is partial (`IS NOT NULL`).
- `messages.channel` is the `web | whatsapp` enum.
- `agent_runs_csat_score_check` permits only null or scores 1 through 5.
- `conversations_expires_at_idx`, `messages_conversation_created_idx`, and `agent_runs_conversation_created_idx` support retention and chronological scans.

## Self-review

- Restored five pre-M4A profile columns after an initial broad mechanical edit attempt; the final generated migration only alters `staff_tasks.profile_id` and adds its context column.
- Kept production database access out of application code; this task adds only schema/configuration.
- No live provider, database, or other credentials are required by default tests.
- `git diff --check` passed before commit.

## Concerns

`npm.cmd install` reported 27 dependency audit advisories (2 low, 11 moderate, 13 high, 1 critical). No audit upgrade or remediation was performed because it is outside this narrowly scoped task; these advisories were not introduced as application-code changes by this implementation.