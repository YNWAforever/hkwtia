# WTIA two-sided platform programme (Phases A–D)

**Status:** approved for execution · **Owner:** Willy (product) · **Source audit:** `docs/wtia-platform-audit-2026-09-08.md` (project doc `claude/wtia-platform-audit-2026-09-08.md`)
**Repo:** `YNWAforever/hkwtia` @ `72e8ecd` (main) · **Live:** https://hkwtia.vercel.app

This is the programme-level plan. It fixes the decisions, the phase boundaries, the file map and the gates. Each phase is executed from its own bite-sized plan in `docs/superpowers/plans/`; Phase A's plan ships with this spec (`2026-09-08-phase-a-foundation-and-funnel.md`). Phases B–D get their plan written with `superpowers:writing-plans` on the day the phase starts, against the code as it exists then — writing them now would guess at files Phase A changes.

---

## 1. Goal

Turn the WTIA platform from a well-built association site into a two-sided platform: WTIA recruits stakeholders, member organisations publish their own events and profiles, prospects and members are reached on WhatsApp first, and the public surface wins on SEO/GEO. Nothing that already works is rebuilt: membership + Stripe, seats, the join wizard, the portal, the 16-section admin, the concierge (web + WhatsApp via Woztell), campaigns/journeys, showcase, sitemap/robots/JSON-LD and the test estate stay as they are and are extended.

## 2. Decisions (D-1 … D-14)

| # | Decision | Rationale / consequence |
|---|---|---|
| D-1 | **Four big phases**, each shippable on its own: A Foundation & funnel · B Two-sided events & directory · C WhatsApp operations · D Growth (SEO/GEO, member tools embed, ticketing). | Each phase ends with production value and its own acceptance gate; nothing waits on a later phase. |
| D-2 | **Exclusive member tool = an external tool embedded in an `<iframe>` inside the portal** (Willy supplies the tool URL later). The platform builds the gated embed page, an allow-listed `frame-src` CSP entry, plan-tier gating and an optional signed-token hand-off — not the tool itself. | Willy's answer 2026-09-08. Keeps `lib/ai` for the profile/event writers only. |
| D-3 | **Paid ticketing is Phase D**, not B. Phase B ships RSVP, waitlist, guest RSVP and `external` registration links. | Willy's answer. Avoids Stripe one-time mode, orders and refunds until member event publishing is proven. |
| D-4 | **WTIA has no WhatsApp Business / Woztell channel yet.** A non-code activation track runs in parallel from Phase A day 1; all WhatsApp code is built and tested against the existing mock adapter (`RUN_LIVE_WOZTELL` unset → `mock:` provider ids) and switched live when the channel and templates are approved. | Willy's answer. Engineering never blocks on Meta/Woztell approval. |
| D-5 | **Tier entitlements** default to: Community — directory card, RSVP, no publishing · Startup — 2 member events/quarter (reviewed), 1 showcase listing · Corporate — unlimited reviewed events, 3 listings, priority WhatsApp lane · Patron — Corporate + featured placement and co-branded events. Encoded in `lib/membership/entitlements.ts`, changeable without touching pages. | Willy's answer. |
| D-6 | **Prospects' WhatsApp numbers are stored** in a new `contacts` table when they message WTIA (legitimate interest: replying), with marketing opt-in kept separately and off by default. The existing HMAC `anonymous_owner_hash` on `conversations` stays as the conversation owner key. | Needed for any human follow-up (audit F3). Privacy statement gains a paragraph in Phase A. |
| D-7 | **Consent provenance** (`*_consent_at`, `*_consent_source`, `*_consent_text_version`) is recorded with every WhatsApp/marketing opt-in; opt-out via STOP/取消, `/api/unsubscribe?channel=`, or the portal writes `message_suppressions` rows and an audit event. | Hong Kong PDPO: consent must be demonstrable; suppression must be channel-specific. |
| D-8 | **Moderation reuses the showcase pattern** (`draft → pending_review → published/rejected` + reviewer columns) for member events and public company profiles. The `approvals` table stays agent-only. | Existing, tested, has an admin review table component. |
| D-9 | **Free-form WhatsApp only inside the 24-hour window; blasts are template-only** — enforced in schema (check constraint), action core and adapter. | Meta policy; the adapter already blocks session sends outside the window. |
| D-10 | **Send queue is a `jobs` kind**, run by the existing Cloudflare Worker cron, claiming `campaign_recipients` with `SKIP LOCKED`, batch 20, ≈1 send/s, 429 → retry with backoff, 4xx terminal. | Mirrors earnestproperty's `campaign-delivery.server.ts` and `jobs.server.ts`; reuses lease columns already on `campaign_recipients`. |
| D-11 | **Public member directory lives at `/members` and `/members/[slug]`**, replacing the temporary 307 to `/showcase`; per-member `Organization` JSON-LD; opt-in per company (`public_profile_status`, default `hidden`). | Audit §8.2; the redirect already reserves the path. |
| D-12 | **All schema changes are additive**; existing booleans (`events.published`, `events.member_only`) stay and are derived from the new enums until the last consumer moves. Migrations are generated with `drizzle-kit generate --name …`, never hand-edited. | Repo rule (`docs/wisetech-merge-rules.md`, AGENTS.md). |
| D-13 | **Demo content** (3 showcase "(Demo)" listings, 1 demo news post) is archived by a guarded script in Phase A, not deleted. | It is indexable today and reads as unlaunched. |
| D-14 | **`hkwtia.org` cutover** is a Phase D gate item: `NEXT_PUBLIC_SITE_URL` flip, sitemap host test, 308 from the vercel.app host. | Canonicals currently point at the preview host. |

## 3. Phase map

```
A  Foundation & funnel        weeks 1–3   join/CTA repairs · consent capture · contacts · interest form
                                          click-to-chat · inbox v0 (read) · staff tasks · unsubscribe channels
                                          entitlements · segment v1.5 · hygiene · Woztell application (ops track)
B  Two-sided events & directory weeks 4–9 event schema + member publishing + review queue · guest RSVP
                                          reminders · /events filters · /members directory + member pages
                                          member logo upload · public profile review · organiser JSON-LD
C  WhatsApp operations        weeks 10–15 inbox v1 (human lane, reply, assign, templates, delivery status,
                                          backfill) · contacts pipeline · campaigns UI + WhatsApp send queue
                                          · segment v2 · template registry · notifications dispatcher · go-live
D  Growth                     weeks 16+   SEO/GEO entity pages + internal linking + og images · GSC loop
                                          member tools iframe embed · AI writers · ticketing · domain cutover
```

Each phase has three gates: **code gate** (`npm run audit:strings && npm test && npm run lint && npm run typecheck && npm run build` green, new Playwright specs green against a Preview), **content gate** (real data present, demo data archived), **owner gate** (Willy walks the acceptance script in both locales).

## 4. Phase A — Foundation & funnel (plan: `docs/superpowers/plans/2026-09-08-phase-a-foundation-and-funnel.md`)

Outcome: every recruitment CTA lands somewhere useful, every visitor and member can opt into WhatsApp with recorded consent, prospects who write in become `contacts`, staff can read every WhatsApp/web conversation and every escalation, and the tiers sell something.

| WP | Scope | Files (create / modify) |
|---|---|---|
| A-1 Entitlements & tier copy | `lib/membership/entitlements.ts`; per-tier benefit strings; "Join now" CTA for self-serve tiers | `lib/membership/entitlements.ts` (C), `app/[locale]/(public)/membership/page.tsx` (M), `messages/{en,zh-HK}.json` (M) |
| A-2 Bare `/join` plan chooser | Render the four plans when no `?plan` and no continuation | `app/[locale]/(join)/join/page.tsx` (M), messages |
| A-3 Schema | `profiles` consent provenance; `contacts` table + enums; migration 0025 | `lib/db/schema-core.ts` (M), `drizzle/0025_*.sql` (generated), `tests/unit/schema-contract.test.ts` (M) |
| A-4 Join consent capture | `profileSchema` + profile step fields + repository types | `lib/membership/join-schema.ts`, `lib/db/repos/profiles.ts`, `app/[locale]/(join)/join/actions.ts`, `app/[locale]/(join)/join/profile/page.tsx` |
| A-5 Portal consent | Profile page fields + command core | `lib/portal/command-core.ts`, `lib/portal/commands.ts`, `lib/portal/queries.ts`, `app/[locale]/(member)/portal/profile/page.tsx` |
| A-6 Contacts repository | Capability-actor repository for public and webhook writers | `lib/db/repos/contacts.ts` (C) |
| A-7 Interest form | Replaces the circular "Get activity updates" CTA on `/events` and the home "Open now" band | `lib/growth/interest-service.ts` (C), `lib/growth/interest-action.ts` (C), `components/marketing/interest-form.tsx` (C), `app/[locale]/(public)/events/page.tsx` (M), `components/home/open-now.tsx` (M) |
| A-8 Webhook contact + opt-out | Unknown WhatsApp sender → contact; STOP → suppression + audit | `lib/ai/woztell-webhook.ts`, `lib/ai/woztell-production.ts`, `lib/db/repos/suppressions.ts` |
| A-9 Unsubscribe channels | `channel=email|whatsapp|all` on the route and page | `lib/api/unsubscribe-route.ts`, `app/[locale]/(public)/unsubscribe/page.tsx` |
| A-10 Click-to-chat | `wa.me` builder + component in header, footer, contact, events, membership | `config/site.ts`, `lib/whatsapp/click-to-chat.ts` (C), `components/marketing/whatsapp-link.tsx` (C), `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`, `app/[locale]/(public)/contact/page.tsx` |
| A-11 Inbox v0 + staff tasks | Read-only conversation list/transcript, open-task list with resolve, nav + dashboard tile | `lib/db/repos/inbox.ts` (C), `lib/db/repos/staff-tasks.ts` (M), `lib/admin/inbox.ts` (C), `lib/admin/task-actions.ts` + `task-action-core.ts` (C), `app/[locale]/(admin)/admin/inbox/page.tsx`, `app/[locale]/(admin)/admin/inbox/[id]/page.tsx`, `app/[locale]/(admin)/admin/tasks/page.tsx`, `components/admin/inbox-*.tsx`, `config/internal-navigation.ts`, `components/admin/admin-nav.tsx`, `app/[locale]/(admin)/admin/page.tsx` |
| A-12 Segment v1.5 | `whatsappOptIn` filter | `lib/admin/segment-schema.ts`, `lib/db/repos/segments.ts`, `components/admin/segment-builder.tsx` |
| A-13 Hygiene | programme header year; `/portal` anonymous redirect without a thrown error; demo-content archive script; privacy statement paragraph | `lib/programs/programme-header.ts`, `app/[locale]/(member)/portal/page.tsx`, `scripts/archive-demo-content.ts` (C), messages |
| A-ops Woztell application | See §8 | no code |

Acceptance script (both locales): header "Join WiseTech" → plan chooser → Startup → magic link → profile step shows WhatsApp number + consent → portal profile shows and edits it → `/events` interest form submits and a `contacts` row exists with `source='interest_form'` → `/contact` shows a WhatsApp button that opens `wa.me` with prefilled text → a mock inbound webhook from an unknown number creates a `contacts` row and the thread appears in `/admin/inbox` → replying STOP writes a `message_suppressions` row → `/admin/tasks` lists the concierge escalation and it can be resolved → `/membership` shows distinct benefits and "Join now" on Community/Startup/Corporate.

## 5. Phase B — Two-sided events & directory (weeks 4–9)

**Schema (migrations 0026–0028, generated):** `events` gains `organiser_company_id`, `submitted_by_profile_id`, `status` (`event_status`: draft/pending_review/published/rejected/cancelled; `published` boolean kept in sync by the repository), `visibility` (`public/members_only/invite_only`; `member_only` kept in sync), `format` (`in_person/online/hybrid`), `online_url`, `registration_mode` (`rsvp/external/ticketed`), `external_registration_url`, `tags text[]`, `published_at`, `reviewed_at`, `reviewed_by_profile_id`, `rejection_reason`, plus checks (`format='in_person' OR online_url IS NOT NULL`). New `event_guest_registrations` (event, contact, name, email, whatsapp_number, organisation, status, marketing_consent_at, cancel_token_digest, idempotency_key, checked_in_at; unique event+email). `companies` gains `slug` (partial unique), `logo_media_id`, `tags text[]`, `tagline_en/zh_hk`, `description_zh_hk`, `public_profile_status` (`hidden/pending_review/published`, default hidden), `public_profile_published_at`. `leads.listing_id` becomes nullable and `leads.contact_id` is added (showcase intros become contacts).

**Work packages**
- B-1 Events repository v2: `eventsRepository.submitForReview(actor, companyId, input)`, `saveDraft`, `review(actor, id, decision)`; entitlement check (`publishEvents` per quarter) in `lib/events/entitlement-core.ts`; public list/detail read `status='published'` and `visibility`; `getEventBySlug` for members respects `members_only`.
- B-2 Portal event publishing: `/portal/events/new`, `/portal/events/[id]/edit`, `components/portal/event-form.tsx` (bilingual, hero image via a member-scoped upload that writes a `media` row with `registered_by_profile_id` and the same validators as `lib/admin/media-upload-service.ts`), submission confirmation email + WhatsApp template `wtia_event_review_result_*`.
- B-3 Admin review tab in `/admin/events-mgmt` (`status='pending_review'`) reusing `components/admin/showcase-review-table.tsx`; audit rows `event.review.approved|rejected`.
- B-4 Guest RSVP: `lib/events/guest-registration-core.ts` (honeypot + limiter + idempotency, exactly the interest-form shape), form on `/events/[slug]` for `visibility='public'` when the visitor is anonymous, cancel link, guest rows in the admin attendee table and CSV export, contact upsert (`source='event_guest'`).
- B-5 Reminders: journey `event_reminder` (24 h before; channels email + whatsapp; classification transactional) enrolled at registration; uses `journey_state` and the existing runners.
- B-6 Public discovery: `/events` filters (`format`, `month`, `organiser`, `tag`) with URL state; organiser block + `Event.organizer` JSON-LD on detail; `/members`, `/members/[slug]` (composes company + published listing + published events; `Organization` JSON-LD with `memberOf`; `BreadcrumbList`; bilingual metadata; added to `app/sitemap.ts`); remove the `/members` redirects from `next.config.ts`.
- B-7 Portal company profile: logo upload, tags (controlled list in `config/industry-tags.ts`), taglines, "publish my profile" → `pending_review` → admin review tab in `/admin/members` (or `/admin/profiles-review`).
- B-8 Tests: repository tests per new method; Playwright `member-event-publishing.spec.ts` (submit → review → public), `guest-rsvp.spec.ts`, `public-directory.spec.ts`; schema-contract additions; Vitest sharding in CI (`--shard`).

Gate: a Startup member publishes an event that appears on `/events` with organiser attribution after staff approval; a guest RSVPs without signing in and receives confirmation; the member's `/members/[slug]` page validates in Google's Rich Results test.

## 6. Phase C — WhatsApp operations (weeks 10–15)

**Schema (0029–0031):** `conversations` + `contact_id`, `channel`, `handling` (`bot/human/closed`), `assigned_to_profile_id`, `whatsapp_member_id`, `last_inbound_at`, `last_staff_read_at`, `subject`; owner check widened to allow `contact_id`; `messages` + `direction`, `delivery_status`, `sent_by_profile_id`, `template_key`, `error_code`, `delivered_at`, `read_at`; `message_role` gains `staff`. `whatsapp_templates` (key, element_name, language_code, category, variables, previews, status, approved_at). `campaigns` + `name`, `channel`, `template_key`, `variables_template`, `scheduled_at`, `reviewed_*`, `completed_at`; `campaign_status` gains draft/review/scheduled/sending/failed; `campaign_recipients` email nullable + `contact_id`, `whatsapp_number`, `provider_message_id`, `sent_at`, `delivered_at`, `read_at`, `blocked_reason`; check `channel <> 'whatsapp' OR template_key IS NOT NULL`.

**Work packages**
- C-1 Webhook v2 (`lib/ai/woztell-webhook.ts`, `lib/channels/woztell.ts`): normalise three event kinds — inbound message (exists), delivery status (`messages.delivery_status` by `provider_message_id`), outbound echo (BOT/MANUAL/RELAY → `direction='outbound'`, `sent_by=null`); resolve contact by Woztell member id then number; `handling='human'` → persist + notify, skip the concierge.
- C-2 Inbox v1: `lib/admin/inbox-action-core.ts` (reply session / reply template / assign / set handling / mark read / close) with `"use server"` wrappers; thread UI with direction, delivery ticks, window countdown from `last_inbound_at`, template picker limited to `status='approved'`, per-conversation drafts in `sessionStorage`; write-ahead `messages` row (`delivery_status='queued'`) → adapter → `sent|failed`; every send audited.
- C-3 Backfill: `app/api/admin/woztell/backfill/route.ts` (admin bearer + `WOZTELL_OPEN_API_TOKEN`, GraphQL `conversationHistory`, cursor loop, same normaliser).
- C-4 Contacts pipeline `/admin/contacts` (stage, owner, source, last inbound, opt-in; deep link to thread; convert-to-member link) and merge-on-login (`contacts.profile_id` set when a matching email/number signs in).
- C-5 Campaigns UI `/admin/campaigns`: name → channel → template → segment → eligibility preview (eligible / no number / not opted-in / suppressed / plan-ineligible) → review by a second admin → schedule; `campaign-runner` gains a WhatsApp branch; job kind `whatsapp-send-queue` + `app/api/jobs/whatsapp-send-queue/route.ts` + cron `*/10 * * * *` in `workers/wrangler.toml` and `workers/src/index.ts`; per-campaign report.
- C-6 Segment v2 (`filter_version: 2`): `industryTags`, `companyPlan`, `event: {eventId, state}`, `audience: members|contacts|both`, `contactStage`, `contactSource`; one-click preset "members not yet registered for event X".
- C-7 Template registry `/admin/templates` seeded from `config/whatsapp-templates.ts`; `WOZTELL_APPROVED_TEMPLATE_KEYS` becomes a fallback read only when the table is empty.
- C-8 Notifications dispatcher `lib/notifications/dispatch.ts` (recipient, classification, template, variables → suppression/consent check → `email_log`/`whatsapp_log` → Resend/Woztell) used by B-2, B-4, B-5 and C-5.
- C-9 Go-live: flip `RUN_LIVE_WOZTELL=1` on production after the §8 checklist; acceptance with `RUN_LIVE_WOZTELL_ACCEPTANCE` against a staff number; monitor `whatsapp_log` and `aiops_monthly_metrics`.

Gate: a prospect messages the WTIA number, the concierge answers, staff take over in the inbox and reply inside the window; a reviewed template blast to a segment of 20 opted-in members sends, delivery ticks arrive, one STOP suppresses that member from the next blast.

## 7. Phase D — Growth (weeks 16+)

- D-1 SEO/GEO: `Article` JSON-LD on news, `BreadcrumbList` everywhere, `Person` on the chairman page, `EventSeries` on programme pages, every history milestone in the sitemap, per-entity `og:image` via `app/api/og/route.tsx` (`next/og`), typed related-links blocks (programme ↔ editions ↔ events ↔ organisers ↔ showcase ↔ news), weekly scheduled LHCI against production, GSC cross-reference (crawled-not-indexed vs the URL inventory; top queries; internal-link counts).
- D-2 Member tools embed: `/portal/tools` (+ `/portal/tools/[key]`) rendering an `<iframe>` from `config/member-tools.ts` (`{key, url, tiers, titleKey}`), CSP `frame-src` limited to the configured hosts (added to `next.config.ts` `contentSecurityPolicy`), tier gate from `lib/membership/entitlements.ts`, optional signed hand-off token (`?wtia=<HS256 JWT: profileId, companyId, plan, exp 5 min>`) generated server-side with a dedicated secret so the embedded tool can identify the member without a second login.
- D-3 AI writers in the portal: profile/listing writer and event description generator (`lib/ai/tools/writers/*`, provider abstraction, redaction, per-plan quota from `agent_runs`), always landing as drafts.
- D-4 Ticketing: `event_orders` (event, registration, amount_hkd, currency, stripe_checkout_session_id, status), Checkout `mode: "payment"`, webhook branch on `checkout.session.completed` with `metadata.kind='event_ticket'`, refund policy page, ticket email with QR (existing check-in table).
- D-5 Domain cutover: `NEXT_PUBLIC_SITE_URL=https://hkwtia.org`, sitemap-host unit test, `hkwtia.vercel.app` → 308, GSC property + sitemap resubmission.

Gate: member pages and events appear in AI answer engines for "Hong Kong wireless technology association members" style queries within one crawl cycle; a member opens the embedded tool from the portal without a second login.

## 8. Ops track — WhatsApp Business + Woztell activation (starts Phase A day 1, no code)

1. **Meta Business Manager**: verify WTIA's business (BR certificate, hkwtia.org domain once live; the vercel.app host is acceptable for verification only if the domain is not yet transferred), add a WhatsApp Business Account, choose a dedicated number (not the office landline unless it is free of an existing WhatsApp registration).
2. **Woztell**: create the channel for that number; note `WOZTELL_CHANNEL_ID`; create a bot access token (`WOZTELL_API_TOKEN`) and, for Phase C backfill, an Open API token with `api:admin` (`WOZTELL_OPEN_API_TOKEN`); set a webhook signing secret (`WOZTELL_WEBHOOK_SECRET`) and register `https://<host>/api/webhooks/woztell` (header `x-woztell-signature`, HMAC-SHA256 base64 — `lib/channels/woztell.ts:191-211`).
3. **Templates** (submit in Phase A so approval lands before Phase C): the four in `config/whatsapp-templates.ts` plus `wtia_event_confirmation_{en,zh_hk}`, `wtia_event_reminder_24h_{en,zh_hk}`, `wtia_event_review_result_{en,zh_hk}`, `wtia_announcement_{en,zh_hk}`, `wtia_lead_followup_{en,zh_hk}`; marketing category for announcement/follow-up, utility for the rest; every marketing body ends with "Reply STOP to opt out / 回覆 取消 以停止接收".
4. **Vercel env**: `WOZTELL_API_TOKEN`, `WOZTELL_CHANNEL_ID`, `WOZTELL_WEBHOOK_SECRET`, `WOZTELL_APPROVED_TEMPLATE_KEYS` (comma list of approved keys), `RUN_LIVE_WOZTELL=0` until C-9.
5. **Number hygiene**: quality rating monitored in Meta; blast pacing per D-10; opt-out honoured within one job cycle.

## 9. Cross-phase engineering rules (inherit CLAUDE.md; these are the additions)

- Every new write path goes through a repository that takes an `Actor` (or a capability actor such as `unsubscribeActor()`), and public writers (interest form, guest RSVP, webhook) use dedicated capability actors — never the anonymous actor with a permissive branch.
- Every consent change writes an `audit_events` row in the same transaction (`consent.whatsapp.granted|revoked`, `consent.marketing.granted|revoked`).
- Every new page namespace lands in both bundles in the same commit; run `npm run audit:strings` before every hand-off.
- Migrations: change `lib/db/schema-core.ts`, run `npx drizzle-kit generate --config=drizzle.config.ts --name <tag>`, commit the SQL + `drizzle/meta/*` untouched, extend `tests/unit/schema-contract.test.ts`.
- New admin routes are added to `config/internal-navigation.ts` + `components/admin/admin-nav.tsx` `linkLabelKeys` + `Admin.navigation.*`; the admin route discovery test picks them up.
- Playwright specs for each user-facing flow run against a Preview before merge; LHCI thresholds unchanged.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Meta/Woztell approval slips past Phase C | D-4: mock adapter keeps every flow testable; C-9 is a flag flip. |
| Consent wording rejected by WTIA's PDPO review | Text versioned (`*_consent_text_version`); wording lives in messages, not code. |
| Member event spam | Entitlement caps (D-5) + review queue (D-8) + audit trail. |
| Full Vitest suite too slow for CI | B-8 shards the suite; targeted runs remain the local default. |
| Canonicals still on vercel.app when GEO work lands | D-14 gate; sitemap-host test. |
