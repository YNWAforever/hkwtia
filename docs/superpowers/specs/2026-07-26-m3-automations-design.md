# M3 Automations Design

**Status:** Approved in conversation on 2026-07-26; written-spec review pending
**Source of truth:** `WTIA_Codex_Build_Spec_v1.1.md`
**Baseline:** `origin/main` at `ea0f84b`

## 1. Purpose and scope

M3 adds deterministic member-lifecycle automation to the existing Next.js and Neon application. It covers onboarding, renewal, payment dunning, win-back, queued campaign delivery, engagement scoring, approval expiry, bilingual email templates, WhatsApp delivery boundaries, and Cloudflare scheduling.

M3 does not add AI operations, forum or group features, Showcase, Launch Pad, SMS, conversational WhatsApp replies, or Cloudflare Queues and Workflows. Those remain deferred to later milestones.

## 2. Chosen architecture

The application owns journey definitions, state transitions, delivery idempotency, auditing, and business-time calculations. Neon is the durable source of truth. Next.js exposes authenticated job endpoints, while a small Cloudflare Worker invokes those endpoints on schedules and retries transport-level failures.

This approach was chosen because it keeps member state, consent, delivery records, and staff visibility in one auditable system. Two alternatives were rejected:

- Resend-native automations would split journey state and audit history between the application and provider.
- Cloudflare Queues or Workflows would introduce a second orchestration state machine beyond the M3 requirements.

### Component boundaries

- `config/journeys.ts`: the typed, single source of truth for journey steps, offsets, channels, message keys, classifications, and conditions.
- `lib/automation`: HKT scheduling, enrollment, due-row selection, dynamic branch evaluation, suppression, state transitions, and retry policy.
- `lib/email`: React Email rendering plus Resend and test transports.
- `lib/channels`: provider-neutral channel interfaces and the WOZTELL adapter. It uses a deterministic mock transport until WABA credentials and approved templates exist.
- `/api/jobs/*`: POST-only, `CRON_SECRET`-protected job handlers.
- Cloudflare Worker: UTC cron scheduling, bounded request retry, and failure notification. It does not own journey state.

## 3. Data model

M3 uses an additive migration.

### `journey_state`

Each row represents one step of one journey instance:

- `profile_id`
- `journey`
- `instance_key`
- `step`
- `scheduled_at`
- `status`: `scheduled`, `processing`, `sent`, `skipped`, or `failed`
- `attempt_count`
- `claimed_at` and `claim_expires_at`
- `delivery_key`
- `error_code`
- created and updated timestamps

The unique key is `(profile_id, journey, instance_key, step)`. `instance_key` identifies the business occurrence, such as an activation ID, membership period end, payment-dunning episode, or cancellation event. It allows a member to enter recurring renewal journeys without duplicating steps within one period.

Allowed transitions are:

- `scheduled -> processing`
- `processing -> sent`
- `processing -> skipped`
- `processing -> scheduled` for retryable failures
- `processing -> failed` for exhausted or permanent failures
- `failed -> scheduled` only through an audited staff retry

`sent` and `skipped` are terminal. Stale `processing` rows become claimable after their lease expires.

### Delivery logs

`email_log` gains a journey-state reference, unique idempotency key, locale, attempt count, and sanitized error code. The database uniqueness constraint provides permanent duplicate protection beyond Resend's 24-hour idempotency window.

A new `whatsapp_log` records equivalent WhatsApp delivery metadata and mock or live provider results. It never stores message bodies or secrets.

### Staff tasks and suppression

A new `staff_tasks` table records actionable automation exceptions, including D90 low engagement, unresolved D14 dunning, and permanent delivery failure. These are not represented as approvals or free-form member notes.

Suppression remains profile-based and is evaluated with current consent at send time. Marketing suppression does not block required transactional messages.

## 4. Enrollment and processing flow

Enrollment is idempotent:

- Membership activation creates one onboarding instance.
- The daily renewal runner reconciles current membership period ends and creates one renewal instance per period.
- A transition to `past_due` creates one dunning instance per payment episode.
- Cancellation or lapse creates one win-back instance per event.

The journey runner:

1. Atomically claims due `scheduled` rows with a bounded lease.
2. Loads current profile, membership, consent, and suppression state.
3. Re-evaluates the step condition at send time.
4. Marks inapplicable or suppressed steps `skipped` with a non-sensitive reason code.
5. Renders the selected locale with the shared template system.
6. Sends with a stable delivery key derived from the journey-state row.
7. Records the provider result and transitions the row.

Marketing steps require marketing consent and no active suppression. Transactional steps require a valid recipient but are not blocked by marketing opt-out. WhatsApp sends additionally require WhatsApp opt-in and a usable phone number.

All logs are structured and omit recipient addresses, phone numbers, message bodies, tokens, and provider secrets.

## 5. Journey definitions

### Onboarding

- D0 welcome
- D1 member video
- D7 engagement branch: nudge or mixer invitation
- D14 profile-completion branch
- D30 recap
- D45 content prompt
- D60 committee prompt
- D90 engagement review and staff task when score is low

### Renewal

- D-90 reminder
- D-60 reminder
- D-30 reminder
- D-14 reminder, plus WhatsApp when eligible

### Dunning

- D0 payment issue
- D3 follow-up, plus WhatsApp when eligible
- D7 final reminder
- D14 mark the episode lapsed and create a staff task if unresolved

### Win-back

- D7 check-in
- D21 member-value reminder
- D60 final win-back message

Offsets are calculated in Hong Kong time by the application. The scheduler operates in UTC.

## 6. Campaign delivery

The campaign job consumes the frozen `campaign_recipients` snapshot created in M2. Before every send it rechecks current consent and suppression. Locale and approved template variables are snapshotted per recipient, and each recipient gets a stable idempotency key.

Rows are processed independently so one failure cannot roll back successful recipients. Re-running a partially completed campaign sends only recipients that have neither a terminal delivery record nor a currently processing claim.

## 7. Templates, localization, and unsubscribe

M3 provides English and `zh-HK` versions of:

- `welcome`
- `day1_video`
- `day7_nudge`
- `day7_mixer`
- `day14_profile`
- `day30_recap`
- `day45_content`
- `day60_committee`
- `day90_review`
- `renewal_90`
- `renewal_60`
- `renewal_30`
- `renewal_14`
- `dunning_0`
- `dunning_3`
- `dunning_7`
- `lapsed_survey`
- `winback_21`
- `winback_60`
- `lead_ack`
- `lead_staff_notify`
- `approval_request`
- `campaign_generic`

Templates use a shared accessible React Email layout with dark-mode-safe styles. Subject, preview text, and body copy live in the localization message bundles.

Marketing email includes a visible unsubscribe footer and `List-Unsubscribe` headers. Transactional email does not include marketing copy. `/unsubscribe` accepts a signed, expiring token, displays a confirmation state, and provides an atomic one-click POST/API path that updates consent and suppression.

No unverified production sender domain is used.

## 8. Jobs

### Journey runner

Runs hourly and processes due journey and campaign rows. Each invocation uses a time-bucketed `run_key`, making duplicate scheduler requests for the same hour harmless.

### Renewal runner

Runs daily and reconciles membership periods into renewal journey instances.

### Engagement-score runner

Runs daily at 18:00 UTC. The score is the sum of configured engagement-event points over the rolling 90 days, clamped to `0..100`. Trend is the last 30-day point total minus the preceding 30-day point total. Recalculation is deterministic for the same event data.

### Approval expirer

Runs hourly. Pending approvals older than 72 hours transition to `expired` and generate a staff task.

The M4 `aiops-metrics` contract remains deferred; M3 does not publish invented metrics.

## 9. Retry, concurrency, and failure handling

Network failures, HTTP 429, and provider 5xx responses are retryable. They use exponential backoff and stop after three delivery attempts. Provider 4xx responses, invalid templates, and invalid recipients are permanent failures and create staff tasks.

Atomic row claims prevent concurrent runners from sending the same step. A crashed claim is recoverable after its lease expires. If a process crashes after the provider accepts a send but before the database commit, the stable provider idempotency key prevents a second provider send; the database delivery-key constraint provides a second durable guard.

The Cloudflare Worker retries only failed HTTP invocation attempts. It does not retry successful job responses or make delivery decisions. Repeated endpoint failure triggers the application alert endpoint; if the application is completely unreachable, the Worker emits a structured Cloudflare error log for external monitoring.

## 10. Staff experience

A read-only `/admin/automations` view shows job health, due and upcoming work, failures, retry eligibility, and aggregate delivery results. An audited retry action is available only for permanent failures. Sent rows can never be retried.

Member 360 shows journey history, channel delivery status, suppression state, and non-sensitive failure codes. Neither interface exposes provider credentials, tokens, full message bodies, or unnecessary personal data.

## 11. Security

- Job endpoints accept POST only.
- Authentication uses a constant-time comparison of the bearer token against `CRON_SECRET`.
- Jobs execute through the system actor and existing repository/audit boundaries.
- Logs and errors use sanitized codes and exclude personal data and secrets.
- WOZTELL M3 delivery is limited to approved outbound templates. The outside-24-hour conversational rule and inbound conversation handling remain deferred.

## 12. External launch dependencies

The following do not block deterministic implementation and Preview testing, but they do block the corresponding live provider path:

- Live Resend delivery requires a WTIA-owned verified sender domain and a sending-only API key. The existing Fimmick domain must not be used.
- Live WOZTELL delivery requires the WTIA WABA/channel credentials and approved message templates. Until then, the mock adapter is the accepted M3 Preview behavior.
- The available Cloudflare account can host the isolated Preview Worker.

Provisioning or changing these external resources requires separate explicit authorization.

## 13. Acceptance criteria

- Running the same hourly job twice produces exactly one send per due step.
- Seeded D7 onboarding members take the correct conditional branch.
- Marketing opt-out blocks marketing journeys and campaigns but not transactional delivery.
- Every template has passing English and `zh-HK` render snapshots.
- An opted-in renewal member produces one D-14 WhatsApp log; an opted-out member produces none.
- M2 campaign delivery remains idempotent and respects current suppression.
- `/admin/automations` and Member 360 display real seeded automation records.
- Worker schedule, bounded retry, and failure alert paths pass in isolated Preview.
- Concurrency behavior passes against isolated Postgres.
- Full regressions, type checking, linting, build, and dependency audit are reported separately, with pre-existing issues distinguished from M3 regressions.
- A live Resend smoke send is required before provider go-live, after the WTIA sender domain and key are ready; it is not falsely claimed by mock or test-transport verification.

## 14. Deferred work

- M4: AI operations, conversational WhatsApp handling, outside-24-hour response logic, and operational metrics contract.
- M5 and M6: Showcase, Launch Pad, forum, groups, and other later roadmap features.
- Out of scope: SMS, Cloudflare Queues, Cloudflare Workflows, provider-owned journey state, and use of unrelated sender domains.
