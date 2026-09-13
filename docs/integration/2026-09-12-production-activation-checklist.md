# Production activation — walk record

Plan: `docs/superpowers/plans/2026-09-12-production-activation.md`.
Statuses: `pending` · `done` (with evidence) · `blocked` · `declined` (with a reason).

The walks are owner actions: each needs a real magic-link sign-in, which cannot be
performed on the owner's behalf. Rows 1 and 2 additionally need the `#58` promote, which
the owner has deliberately held.

| # | Walk | Proof required | Status | Evidence |
|---|---|---|---|---|
| 1 | Staff signs in and lands on `/admin` | Four dashboard queues render real counts; no new runtime error group | blocked | Fix merged in #58 (`2971c99a`) but **not promoted**; production still serves `6b76ab3d`. The bug this walk covers is confirmed in production logs — see *Runtime errors* below. |
| 2 | Staff comps a membership to a second profile; that account signs in | `/portal` renders status and onboarding; the comp wrote a `membership.comped` audit row | blocked | Same promote hold. The form, action and repository are merged and covered by 15 unit tests. |
| 3 | A company profile is submitted and approved at `/admin/profiles-review` | The row appears on `/members` and `/members/[slug]` renders with JSON-LD | pending | Unblocked by the `0028`–`0030` apply below — the schema this walk needs was missing until 2026-09-13. All 3 companies are currently `public_profile_status = hidden`, so `/members` is legitimately empty until one is approved. |
| 4 | `/join` renders four plans; selecting one creates a Checkout session | Session visible in Stripe. Stops there — no charge (spec P-4) | pending | Owner action. |

## Migration output

Ground truth before any change, read from `drizzle.__drizzle_migrations` in production
(2026-09-13). Hashes were matched to journal tags under both LF and CRLF normalisation,
because the applied set was written from machines with different line-ending conventions —
17 rows matched CRLF, 10 matched LF, 27 total, reconciling exactly with the row count and
leaving **zero** production rows unaccounted for.

```
journal entries: 34
production applied rows: 27
matched by either line-ending variant: 27
production rows matching NO journal file: 0

NOT APPLIED in production:
   0028 0028_phase_b_company_profiles
   0029 0029_phase_b_company_slugs
   0030 0030_phase_b_members_route
   0031 0031_phase_c_conversation_operations
   0032 0032_phase_c_message_direction_backfill
   0033 0033_phase_c_campaign_channels
   0034 0034_phase_c_whatsapp_template_seed
```

This is the fact that mattered: production had been serving Phase B and Phase C code
(`6b76ab3d`, deployed 2026-09-12 17:48) against a database missing the seven migrations
that code requires. Nothing looked wrong from outside, because public pages degrade with
`.catch(() => [])` by design.

**Rehearsal** on Neon branch `activation-rehearsal-2026-09-13` (`br-fancy-haze-aoh0adx6`),
cut from production so it carried the real data shape. `npm run db:migrate` → `migrations
applied successfully`. Verification:

```
applied            : [{"applied":34}]
templates          : [{"templates":10,"not_pending":0}]
orphan_recipients  : [{"orphan_recipients":0}]
company statuses   : [{"public_profile_status":"hidden","count":3}]
slugless companies : [{"slugless":0}]
```

**Production apply**, 2026-09-13, after owner authorisation. `npm run db:migrate` →
`migrations applied successfully`. Re-verified with the same five queries, byte-identical
results:

```
applied            : [{"applied":34}]
templates          : [{"templates":10,"not_pending":0}]
orphan_recipients  : [{"orphan_recipients":0}]
company statuses   : [{"public_profile_status":"hidden","count":3}]
slugless companies : [{"slugless":0}]
```

`templates = 10` is why the go-live checklist's exit condition was corrected from 9 —
PR #54 added `event_reminder_24h_zh_hk`, so the stale check would have read a correct
migration as a failed one.

## Runtime errors

Read from the Vercel runtime-errors API for the 24h to 2026-09-13, all against deployment
`dpl_8JzAmC4QRPadRgsmhbsx74YUBuve`. Recorded here as the "before" line for walk 1.

| Group | Count | Route | Disposition |
|---|---|---|---|
| `AuthorizationError: FORBIDDEN` | 1 | `/[locale]/portal` | **This is the Task 1 bug, caught in production.** Fixed in #58; will recur until promoted. |
| `MISSING_MESSAGE: Admin.pageCopy.namespaces.{Partners,MarketingExtras,Programmes}` (zh-HK) | 3 | `/[locale]/admin/page-copy` | **Not fixed — outside this plan.** All three labels are absent from *both* bundles, so `/admin/page-copy` throws in either locale, not just zh-HK. See *Open* below. |
| `Unhandled error. ()` (WebSocket) | 3 | `/[locale]/member-login`, `/[locale]/admin/tasks.rsc` | Unattributed. Stack is a driver-level socket error with no application frame. Worth re-reading after the promote, when the migration state and the auth path have both changed. |

## Open

- **`/admin/page-copy` throws `MISSING_MESSAGE` for three namespaces.** The page enumerates
  top-level message namespaces and looks up `Admin.pageCopy.namespaces.<name>` for a label;
  `Partners`, `MarketingExtras` and `Programmes` have no such label in `en` or `zh-HK`.
  A six-string fix, but a behaviour change this plan did not authorise.
- **Nothing prevents a duplicate comped membership.** `memberships_owner_idx` is a plain
  index, not unique, and `compMembership` does not check for an existing row, so comping a
  member who already has a membership creates a second one. Needs a product decision —
  refuse, replace, or allow — before it is worth a constraint.

## Deferred

- The paid leg: live charge and webhook activation (spec P-4).
- Phase C activation: `RUN_LIVE_WOZTELL`, Meta/Woztell approval, the PDPO retention answer.
