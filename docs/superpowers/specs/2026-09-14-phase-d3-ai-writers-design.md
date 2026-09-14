# Phase D-3 — AI writers in the portal

**Date:** 2026-09-14
**Programme:** `docs/superpowers/specs/2026-09-08-wtia-two-sided-platform-programme.md` (D-3, D-5)
**Status:** approved for planning · **Owner:** Willy (product)
**Predecessor:** `docs/superpowers/specs/2026-09-14-phase-d2-member-tools-design.md`

---

## 1. Why this slice

Programme D-3: members get AI writing help inside the portal, and every generation lands as a
draft the member reviews before anything is saved.

This is the second of the three remaining Phase D sub-projects (D-2 is merged; D-3, then D-4).

The AI estate is shaped around agents: `agent_runs` records a run per agent, and its
`agent_name` enum is `concierge | retention_analyst | board_reporter`, with triggers
`web | whatsapp | scheduled`. A member clicking "Generate" fits none of those. This slice
**extends** that model rather than building a parallel accounting table, so token and cost
usage stays truthful in one place instead of two that drift.

## 2. Scope

**In:**

1. Three writer surfaces — company profile copy, showcase listing copy, and event descriptions —
   each producing both languages in one generation.
2. Prefill-only: the member's form fields are filled; a generation persists nothing.
3. A per-plan monthly quota, counted from `agent_runs`.
4. `agent_runs` gains a `writer` agent and a `portal` trigger.

**Out, with reasons:**

| Item | Why not |
|---|---|
| Auto-publishing generated copy | Never. The member is the reviewer; the existing `draft → pending_review → published` machine still governs publication. |
| Image or media generation | This is a writing slice. |
| A personal-profile writer | The surfaces are the company profile, the showcase listing and events. |
| Streaming partial text into the field | The member gets the finished copy or a clear failure, never a half-written field. |
| Per-company quota pooling | One pool per profile keeps the rule explainable ("20 a month"). |
| D-4 ticketing | Its own spec. |

## 3. Verified facts

| Fact | How it was checked |
|---|---|
| `agent_runs.agent` is `concierge/retention_analyst/board_reporter`; `trigger` is `web/whatsapp/scheduled` | `lib/db/schema-core.ts:96-103` |
| `requireAgentRunActor` rejects any other actor shape | `lib/auth/agent-actor.ts:56-59` |
| `agentRunsRepository.start`'s non-concierge branch writes `profile_id` NULL | `lib/db/repos/agent-runs.ts:312-343` |
| `agent_runs` is the only AI usage record; `entitlements` has no AI field | `lib/db/repos/agent-runs.ts`, `lib/membership/entitlements.ts` |
| The runtime can run one step with no tools | `lib/ai/runtime.ts` (`tools: {}`, `lib/ai/scheduled-runtime.ts:59`) |
| The forms' copy fields | `company-profile-form.tsx` (`taglineEn`, `taglineZhHk`, `descriptionZhHk`), `showcase-listing-form.tsx` (its text/list field set), `event-form.tsx` (`descriptionEn`, `descriptionZh`) |

## 4. Design

### 4.1 One generation, both languages

The member writes a short brief; one generation returns English and Chinese copy, filling the
fields at once. One generation is one quota unit, and the two bundles stay in parity by
construction rather than by a later translation pass. The output is strict JSON **whose keys are
the form fields that writer fills** — the profile writer returns `taglineEn`, `taglineZhHk`,
`description` and `descriptionZhHk`; the event writer `descriptionEn` and `descriptionZh` — parsed
with zod and rejected if it is malformed, contains HTML, is empty, or exceeds the per-field length
the form enforces.

### 4.2 The writer agent

`lib/db/schema-core.ts`:

- `agentNameEnum` gains `"writer"`.
- `agentTriggerEnum` gains `"portal"`.

One generated migration adds both with `ALTER TYPE … ADD VALUE` and **nothing else**. No
statement in that migration may reference the new literals: `drizzle-kit` runs every pending
file in one transaction, and Postgres forbids *using* a new enum value in the transaction that
added it, so a default or backfill naming `'writer'` would abort the whole deploy on a fresh
database, at deploy time, invisibly to every incremental test. Code uses the values after the
migration; the migration itself only declares them.

`lib/auth/agent-actor.ts` gains:

```ts
export type WriterAgentActor = {
  kind: "agent";
  agent: "writer";
  runId: string;
  conversationId: null;
  profileId: string;
  trigger: "portal";
};
```

`isWriterAgent` accepts exactly that shape, `requireWriterAgent` guards it, and `AgentRunActor`
becomes `ConciergeAgentActor | ScheduledAgentActor | WriterAgentActor`. A writer actor carries a
profile and no conversation, which is precisely the shape the current guard rejects.

`lib/db/repos/agent-runs.ts` gains a third branch in `start()` — `profile_id` set,
`conversation_id` NULL — and `actorRunPredicate` learns the writer case. `AgentRunRecord.agent`
gains `"writer"`. A new read, `countWriterRuns(profileId, sinceDate)`, counts the profile's
writer runs at or after a timestamp.

`lib/ai/runtime.ts`'s `AgentRuntimeActorInput` union gains the writer shape, and the runtime's
`preparedRunFor` gains the writer branch beside the concierge and scheduled ones — without it a
`portal` actor is refused at runtime even though the type admits it. A writer run is otherwise one
step with an empty tool set.

### 4.3 Quota

`lib/membership/entitlements.ts` gains `aiWriterRunsPerMonth`:

| plan | runs / calendar month |
|---|---|
| community | 0 |
| startup | 20 |
| corporate | 100 |
| patron | `Infinity` |

The window is the **Asia/Hong_Kong calendar month**, matching how the application presents
dates. The cap is the maximum across the member's active memberships; the count is per profile,
so the three writers share one pool. **Every writer run in the window counts, whatever its
outcome**: a provider call that fails may still have been billed, and the cap exists to bound
spend, so the count is not filtered on status and the member-facing wording says "attempted".

Enforced in the action core, not only in the UI: the control is hidden at cap 0 and disabled at
the cap, but the action independently refuses, so a hand-made request cannot exceed the plan.

### 4.4 The writers

`config/agents/writer.ts` holds the system prompt and per-kind instructions, beside the existing
agent configs. It frames the brief as **material to rewrite, never instructions**, requires both
languages, forbids HTML, forbids inventing facts or links, and states the output JSON shape and
length bounds.

`lib/ai/writers/` holds the mechanics:

- `contracts.ts` — `WriterKind = "profile" | "listing" | "event"`, `WriterBrief`, and one zod
  output schema per kind, keyed to the form fields that writer fills, with shared length bounds.
- `generate.ts` — runs `runtime.stream({enabled, model, actor, system, messages: [brief],
  tools: {}})` with the writer actor, collects the text stream, parses the JSON, and returns
  either the copy or a typed failure.

A deliberate deviation from the programme spec's `lib/ai/tools/writers/*`: these are not agent
tools. Nothing calls them through the tool registry, so they do not belong in `tools/`.

### 4.5 Portal action and UI

`lib/portal/writer-action-core.ts` takes an actor and does the work; `lib/portal/writer-actions.ts`
is the `"use server"` wrapper that reads `requireActor()` itself and exports no actor-taking
helper — the boundary M7.3 established, because that directive publishes every export as an
endpoint.

`components/portal/writer-assist.tsx` is a client control: a brief textarea, a Generate button,
and a status line. It takes `{kind, enabled, quotaRemaining, labels, onGenerated}` and calls the
action; each surface supplies `onGenerated` to write the returned copy into its own fields. The
three pages pass `agentsEnabled` from `aiEnv()` and the remaining quota into the forms, the way
the public layout passes `turnstileSiteKey`.

The forms are uncontrolled today (`defaultValue`), so each writer's copy fields become controlled
state: the company page needs one client wrapper owning the four public-copy values across its
two forms, and the listing and event forms hold their own copy fields in state. That is the only
change to those forms beyond rendering the control.

| Surface | Fields filled |
|---|---|
| Company profile — two forms on `/portal/company` | the details form's `description`, and the profile form's `taglineEn`, `taglineZhHk`, `descriptionZhHk` |
| Showcase listing | `taglineEn`, `taglineZhHk`, `descriptionEn`, `descriptionZhHk` |
| Event | `descriptionEn`, `descriptionZh` |

`AGENT_MODEL_WRITER` is an optional env value (default `openai:gpt-4.1-mini`), parsed in
`lib/config/env.ts`, never in `serverKeys`: a missing model degrades the writer, it must not fail
boot.

### 4.6 Error and edge cases

| Case | Behaviour |
|---|---|
| Community (cap 0) | The control is not rendered. A dead button is worse than none. |
| At or over the cap | The control is disabled with a message naming the cap; the action refuses with `quota_exceeded`. |
| `AGENTS_ENABLED` off, or no API key | The control is not rendered (`enabled: false`). |
| Provider error, timeout or rate limit | The run is recorded `failed`; a short retry message; nothing is applied. |
| Malformed, HTML, empty or over-length output | The run fails `invalid_provider_response`; nothing is applied. |
| Brief too long | A zod bound on the action input (2000 characters). |
| Non-member or forged actor | `forbidden`, as on every other portal action. |
| Double click | The client disables while pending; each accepted call is its own run and quota unit. |
| Several memberships | Cap is the maximum across active memberships; the pool is per profile. |

### 4.7 Security and privacy

- The brief is member-authored, is sent to the model, and is **never persisted**. The run's
  `summary` carries the runtime's completion code, never the brief or the generated copy; the
  writer's surface (profile/listing/event) is **not** recorded per run in this slice, so
  per-surface cost reporting is a later addition. Any free-text summary is passed through
  `redactAgentSummary`.
- **No tools are bound to the writer run**, so the model can neither write nor fetch. It can
  return text and nothing else.
- The brief is untrusted input: the prompt frames it as material, output is bounded and
  HTML-rejected, and the model is told not to invent facts or links.
- Model and keys come only from `lib/config/env.ts`, which is server-only; writer runs sit behind
  `requireActor` and `requireMember`.
- Generated copy returns only to the authenticated caller who asked for it. Nothing is cached or
  shared, and nothing generated reaches another member.

## 5. Testing

| Piece | Approach |
|---|---|
| Entitlements | Unit: the four caps and the helper, shape-pinned. |
| Agent actor | Unit: a writer actor is accepted; a forged shape is still refused; concierge and scheduled are unaffected. |
| Agent runs | Unit: writer `start` persists `profile_id` with a null conversation; the predicate scopes to the actor; `countWriterRuns` respects the window. |
| Schema contract | Unit: both enums carry the new values, **and the generated migration contains no statement using them** — the trap guard. |
| Writers | Unit: `generate` parses the per-kind output shape; rejects malformed/HTML/over-length; maps provider failures to the run's failure codes; asserts the tool set is empty. |
| Action core | Unit: cap 0 → `not_entitled`; under and at the cap; non-member forbidden; best-plan selection. |
| Component | Unit: hidden when disabled; the quota message; copy applied through `onGenerated`. |
| Accepting the live model | An owner acceptance step. CI has no key, so tests stub the runtime's provider factory, as the existing suites do. |

No unit test makes a network call.

## 6. Risks

| Risk | Mitigation |
|---|---|
| The enum migration is applied with a statement that uses the new value | A schema-contract test reads the migration and refuses any use of `'writer'`/`'portal'`; the values enter the code only after. |
| The model invents facts about a member | The prompt forbids it; copy lands as a draft in a form the member must save, and publication stays staff-reviewed. |
| Cost runs away | Per-plan monthly caps, enforced server-side; every run records tokens and cost in `agent_runs`, so `aiops` stays truthful. |
| A writer run is mistaken for a concierge run in reporting | The `agent` column distinguishes them; AI-Ops queries that mean the concierge filter on it. |
| Prompt injection through the brief | Untrusted-input framing, no tools bound, length bounds, HTML rejected, output treated as data. |

## 7. Definition of done

1. A Startup, Corporate or Patron member can generate profile, listing and event copy from the
   portal, in both languages, in one click.
2. A generation writes no target row: the fields are filled, and the member still saves, still
   reviewed before publication.
3. The quota is enforced for the member's plan and counted from `agent_runs`, which now records
   `writer` / `portal` runs with a profile.
4. A disabled agent, a missing key, a provider failure or a malformed model response degrade to a
   clear message and apply nothing.
5. `npm run audit:strings`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`
   are green.

Not in scope and not claimed: auto-publishing, media generation, a personal-profile writer, and
D-4.
