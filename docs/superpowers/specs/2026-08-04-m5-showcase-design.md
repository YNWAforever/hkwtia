# M5 Showcase Design

## Goal

Deliver the WTIA Showcase from member submission through staff publication, with a public, server-rendered directory and a privacy-safe request-intro workflow. The implementation remains isolated to the M5 branch and must not change Production or shared environments.

## Scope and acceptance boundary

M5 includes:

- A company-owned listing at `/portal/company/listing` with draft, review, publish, and reject states.
- Staff review at `/admin/listings-review`, including publish, reject, and manual premium controls.
- Public `/showcase` filtering and search driven entirely by shareable URL parameters.
- Public `/showcase/[slug]` detail pages with video, case-study content, membership tenure, request-intro form, and valid `SoftwareApplication` JSON-LD.
- A `leads` row for each accepted request-intro submission, staff notification, and localized acknowledgement email.
- Published listing URLs in the sitemap and a debounced views counter.

M5 does not include automatic premium scoring, public company-private fields, media upload storage, CRM synchronization, Production migrations/seeding, or new agent behavior.

## Options considered

1. **Reuse the existing posts/news model.** Smallest initial diff, but the model cannot represent company ownership, structured filter facets, review state, leads, or privacy-safe projections without coupling Showcase to editorial content. Rejected.
2. **Store listings in a JSON/content fixture.** Fast for a static demo, but it cannot support member edits, durable review transitions, leads, views, or database-backed filters. Rejected.
3. **Add a dedicated relational Showcase model and repository.** Adds one migration and focused repositories, keeps public reads separate from member/staff writes, and gives every acceptance item a durable seam. Selected.

## Architecture

### Data model

Add a dedicated `showcase_listing_status` enum with `draft`, `pending_review`, `published`, and `rejected` values. Add `showcase_listings` with:

- `id`, `company_id`, `slug`, `status`, `premium`, `views`, `member_since`, `created_at`, `updated_at`;
- bilingual `name`, `tagline`, `description`, and case-study summary fields;
- `category`, `use_cases`, `deployment_options`, `supported_languages`, and `works_with` arrays;
- optional `video_url`, `case_study_url`, and `logo_reference`;
- `reviewed_at`, `reviewed_by_profile_id`, and `rejection_reason`.

Each company has at most one listing in v1. `company_id` and `slug` are unique. Public queries select only published rows and map them to a `PublicListing` projection that excludes reviewer, workflow, and private company columns.

Add `leads` with `listing_id`, contact name, email, optional organisation and message, locale, status, and timestamps. Lead email is stored only in this protected table; it is never included in public listing projections or JSON-LD.

### Repository boundaries

`lib/db/repos/showcase.ts` owns all database reads/writes:

- member-scoped `getByCompany`, `upsertDraft`, and `submitForReview`;
- admin-scoped `listForReview`, `publish`, `reject`, and `setPremium`;
- public `listPublished`, `getPublishedBySlug`, `listPublishedSlugs`, `recordView`, and `createLead`.

The repository accepts an actor where authorization matters and performs the company-role or admin check before mutation. Public methods never return a draft or rejected row.

`lib/showcase/contracts.ts` owns Zod schemas, URL filter parsing, lifecycle transitions, and the stable public view-model types. This keeps server actions, pages, and tests from duplicating validation or state rules.

### Request flow

1. A company owner/admin opens `/portal/company/listing`. The page loads the actor's company and its listing, then renders the bilingual form.
2. “Save draft” validates and persists `draft`. “Submit for review” validates and persists `pending_review`. Editing a published listing creates a reviewable pending revision rather than changing the public row in place.
3. Staff opens `/admin/listings-review`, reviews the private submission, and publishes or rejects it. Publish sets `published`, `reviewed_at`, and reviewer; reject sets `rejected` and a reason. A rejected listing can be edited and resubmitted.
4. `/showcase` parses `category`, `useCase`, `deployment`, `language`, `worksWith`, and `q` from `searchParams`, passes them to a server-side repository query, and preserves the same parameters in all pagination/filter links. Ordering is `premium DESC`, then category/name/created timestamp for deterministic results.
5. `/showcase/[slug]` loads only a published projection. It renders the selected locale, embeds a validated HTTPS video URL when present, emits `SoftwareApplication` JSON-LD from public fields, and includes the request-intro form.
6. The request-intro server action parses Zod input, rejects a non-empty honeypot without revealing whether a lead exists, applies the process-local rate limiter by normalized email plus listing/IP bucket, creates one `leads` row, sends a staff notification, and sends a localized transactional acknowledgement. Email delivery uses the existing configured/test transport and does not block the lead row from being durable if a provider call fails; delivery failures are logged with a safe error code for retry/inspection.
7. A view request calls `recordView(slug, viewerKey)`. A process-local TTL map suppresses repeat writes for the debounce window, and the repository performs an atomic `views = views + 1` update. The interface is intentionally replaceable by a shared store later.
8. `app/sitemap.ts` adds both locale variants for every published listing slug, catching database unavailability the same way as existing dynamic content.

### Staff notification recipient

The notification service resolves normalized email addresses for profiles whose role is `staff`, `exco`, or `superadmin`, with a configured sender fallback for preview/test environments. It never exposes that recipient list to the browser and never writes contact details into logs.

## Error handling and security

- Every mutation validates the complete form with Zod, trims text, bounds array lengths, and rejects unsafe URLs except for HTTPS video/case-study links.
- Actor checks happen inside the repository immediately before each mutation; route visibility is not treated as authorization.
- Public detail pages use `notFound()` for an invalid slug or non-published listing, preventing status enumeration.
- Honeypot submissions return the same user-facing acknowledgement as successful submissions but do not create a lead or send mail.
- Rate limiting returns a generic retry message and never echoes the client IP or raw contact data.
- Leads use a unique idempotency key derived from listing, normalized email, and a short time bucket so browser retries do not create duplicates.
- JSON-LD is generated from escaped public values only. No email, internal IDs, reviewer fields, rejection reasons, or raw form payload are serialized.
- Preview acceptance uses deterministic fixtures and the existing test email transport. No Production/shared environment, paid resource, live mail provider, or live seed is touched by M5 implementation tests.

## Testing strategy

- Contract tests verify enum/table names, constraints, generated Drizzle metadata, and migration journal ordering.
- Unit tests cover URL filter parsing, deterministic premium ordering, lifecycle transitions, validation, honeypot behavior, rate-limit buckets, idempotent lead creation, JSON-LD projection, and debounced view keys.
- Repository tests use dependency injection/fakes to prove actor scoping, public-only reads, atomic view updates, and email delivery failure isolation.
- Route/component tests render both `en` and `zh-HK` states and assert the portal, staff, public list/detail, lead form, JSON-LD, and sitemap contracts.
- The final bounded suite must retain the M4C baseline result (234 files, 1,436 tests, with existing skips) before the M5 acceptance run. The acceptance report records lifecycle, filter URL, lead side effects, sitemap, JSON-LD, premium ordering, and views evidence separately.

## Out of scope and future seam

The repository interface is deliberately independent of the chosen storage implementation, so a later milestone can add uploads, a shared distributed limiter, CRM synchronization, or automated premium rules without changing the public route contracts.
