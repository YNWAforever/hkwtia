# Portal events, directory, documents, tools and billing — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the last seven member-portal pages (events list/new/edit, directory, documents, tools list/page, billing) into the WiseTech grammar and fix their journey problems, with no data or action-contract change.

**Architecture:** Two small shared units (a page header and a date formatter) plus portal CSS, then one task per page group reusing the sub-project 2 form grammar and `PortalImageField`. Pure helpers (`slugFromTitle`, directory paging links, billing renewal line) carry the logic so it is unit-testable; pages stay Server Components except the existing client event form.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, next-intl v4 (en, zh-HK at `/zh`), Vitest + Testing Library, Playwright + axe.

**Spec:** `docs/superpowers/specs/2026-10-08-portal-events-directory-tools-billing-design.md`

## Global Constraints

- Branch `feat/portal-events-directory-tools-billing`, stacked on `feat/portal-forms` (#166); PR base `feat/portal-forms`.
- No change to any query, repository, authorization, server action, migration, or submitted field name / `intent` value. Event form names stay exactly: `slug titleEn titleZh descriptionEn descriptionZh startsAt endsAt venue capacity format onlineUrl visibility registrationMode externalRegistrationUrl tags heroMediaId` plus hidden `intent` (`draft` | `submit`) and `eventId` on edit.
- Reads only via existing `getMemberEvents`, `listMyCompanyEvents`, `loadMemberEventsContext`, `searchDirectory`, `getDocuments`, `getDashboard`, `getBillingSummary`.
- Tool page token handling (`memberToolsEnv`, `toolFrameSrc`, `referrerPolicy="no-referrer"`, no `sandbox`) unchanged, comments kept.
- Every visible string in `messages/en.json` and `messages/zh-HK.json` in parity; `npm run audit:strings` passes. zh terms: 上載, 席位, 名錄, WhatsApp 更新.
- Portal links via `PrivateLink` (`prefetch={false}`); hrefs via `localizedPath`, never a hand-built locale prefix.
- Styles only in `app/styles/wisetech-portal.css`, every selector under `.portal-root`.
- Dates: `Intl.DateTimeFormat(locale, {dateStyle: "long", timeZone: "Asia/Hong_Kong"})`.
- Exactly one primary (`.button`) action per form; secondary actions `.portal-button-outline` or `.text-link`.
- Errors in `.portal-form-alert`; status words in `StatusLabel`; sentences as body text.
- Empty states use `HonestEmpty` (`components/wt/honest-empty.tsx`) with one next step.
- External links keep `target="_blank" rel="noopener noreferrer"` and add a visually hidden "(opens in a new tab)" (new key `Portal.common.newTab`).
- Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `next-env.d.ts` or the CRLF-only email snapshot.

## Review Focus

1. An English title with no ASCII letters or digits (e.g. "人工智能論壇") must leave Page address empty for the member to fill — never "-" or garbage. (Task 3 test.)
2. Editing an event stored as online/hybrid with an `onlineUrl`, or external registration with a link, must show those fields on first render, populated. (Task 3 test.)
3. Events list when `listMyCompanyEvents` succeeds but `loadMemberEventsContext` throws: section still renders, quota line omitted. (Task 2 test.)
4. Directory with a search and a cursor: "Back to first page" keeps the search (`?q=` preserved, cursor dropped). (Task 4 test.)
5. Billing membership with no matching dashboard record or a null `billingPeriodEnd`: renewal line omitted, card still renders. (Task 7 test.)

---

### Task 1: Page header, date formatter and shared portal CSS

**Files:**
- Create: `components/portal/page-header.tsx`, `lib/portal/format-date.ts`
- Modify: `app/styles/wisetech-portal.css`, `messages/en.json`, `messages/zh-HK.json`
- Test: `tests/unit/portal-page-header.test.tsx`, `tests/unit/portal-format-date.test.ts`

**Interfaces:**
- Produces: `PortalPageHeader({eyebrow?: string; title: string; lead?: string; children?: ReactNode})` — renders `<header class="portal-welcome">`, `StatusLabel` eyebrow (only when given), `h1`, `p.portal-welcome-lead` (only when given), then `children` (for status lines / alerts under the title).
- Produces: `formatPortalDate(locale: AppLocale, value: string | Date): string` (long, Asia/Hong_Kong) and `portalDateParts(locale, value): {day: string; month: string}` for the event date block.
- Produces CSS classes: `.portal-card` (inner-card look), `.portal-card-grid` (2 columns ≥821px, 1 below), `.portal-date-block`, `.portal-record` (dl: muted 13px term over 15px value), `.portal-section-head` (heading + one action, wraps on phones), `.portal-paging`, `.portal-frame`.
- Produces key `Portal.common.newTab` = "(opens in a new tab)" / "（在新分頁開啟）".

- [ ] **Step 1: Failing tests** — `PortalPageHeader` renders exactly one `h1` with the title; no `.status-label` when `eyebrow` omitted; lead only when given. `formatPortalDate("en", "2026-11-12T02:00:00Z")` → `"12 November 2026"`; `formatPortalDate("zh-HK", …)` → `"2026年11月12日"`; `portalDateParts("en", "2026-12-31T17:00:00Z")` → `{day: "1", month: "Jan"}` (Hong Kong is UTC+8).
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-page-header.test.tsx tests/unit/portal-format-date.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the two modules and the CSS classes (reuse the existing `.portal-welcome` rules; tokens `--wt-*`).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): shared page header, date formatter and card grammar`

### Task 2: Events list

**Files:**
- Modify: `app/[locale]/(member)/portal/events/page.tsx`, `components/portal/event-registration-form.tsx` (classes only), CSS, messages
- Test: `tests/unit/portal-events-list.test.tsx`; keep `tests/unit/portal-events-registration-mode.test.tsx` green (update only markup-bound assertions)

**Interfaces:**
- Consumes: Task 1 header, `formatPortalDate`, `portalDateParts`, `.portal-card*`, `.portal-section-head`.

- [ ] **Step 1: Failing tests** (mock the reads as the existing registration-mode test does):
  - a WTIA card renders `.portal-date-block` and the venue, and no text "Date:" / "Venue:";
  - rsvp → one `button` "Register"; external → an `a[target=_blank][rel~=noopener]` containing the new-tab sr text; ticketed public → `PrivateLink` to `/events/<slug>`; otherwise the unavailable note;
  - with own events: section heading, exactly one "Submit an event" link (`href` `/portal/events/new`), quota line `"1 of 2 reviewed events used this quarter"`, card status label per status, rejection reason as body text only for `rejected`;
  - **Review Focus 3:** `loadMemberEventsContext` rejects → section renders, no quota text;
  - `listMyCompanyEvents` → null: section absent;
  - no WTIA events: `HonestEmpty` linking to `/events`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-events-list.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Quota via `loadMemberEventsContext(actor).catch(() => null)` only when `mine` is non-null; reuse existing `Portal.memberEvents.quota` / `unlimited` keys. Header: eyebrow `Portal.navGroups.benefits` (existing group label), title `events.title`, lead `events.description`.
- [ ] **Step 4: Run** the new test and `tests/unit/portal-events-registration-mode.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): events list in the WiseTech grammar`

### Task 3: Event form, new and edit pages

**Files:**
- Create: `lib/events/slug-from-title.ts`
- Modify: `components/portal/event-form.tsx`, `components/portal/event-company-picker.tsx`, `components/portal/forms/image-field.tsx` (widen `name`), `app/[locale]/(member)/portal/events/new/page.tsx`, `.../events/[id]/edit/page.tsx`, `.../events/labels.ts`, CSS, messages
- Test: `tests/unit/slug-from-title.test.ts`, `tests/unit/portal-event-form.test.tsx`; keep green `event-form-contract`, `member-event-new-page`, `member-event-edit-page`, `member-event-form-disabled`, `event-private-media-render`

**Interfaces:**
- Produces: `slugFromTitle(title: string): string` — NFKD, strip diacritics, lowercase, runs of non-`[a-z0-9]` → single `-`, trim `-`, cap 80 chars at a hyphen boundary; result matches `[a-z0-9]+(?:-[a-z0-9]+)*` or is `""`.
- Changes: `PortalImageField` `name` becomes `"logoMediaId" | "logoReference" | "heroMediaId"`.
- `EventFormLabels`: drop `heroMediaId`/`heroHelp` text-input labels; add `pageAddress`, `pageAddressHelp` ("Your event will be at {path}"), `groups.{basics,description,whenWhere,registration,imageTags}`, `tagsHelp` ("Separate with commas"), `submitUnavailable`, `image: PortalImageFieldLabels`. Field label "URL slug" → "Page address"; "Tags (comma separated)" → "Tags".

- [ ] **Step 1: Failing tests**
  - `slugFromTitle`: `"AI in Logistics: Roundtable 2026"` → `"ai-in-logistics-roundtable-2026"`; `"Café Día"` → `"cafe-dia"`; **Review Focus 1:** `"人工智能論壇"` → `""`; `"  --  "` → `""`; a 120-char title → ≤80 chars, no trailing `-`.
  - Form (new, `values: null`): typing in `titleEn` sets `slug`; after the user types in `slug`, further title typing leaves it unchanged; path preview shows `/events/<slug>`.
  - Form (edit, values set): title typing never changes `slug`.
  - `format=in_person` → `onlineUrl` input is `hidden` and `disabled`; switching to `online` enables and shows it; `registrationMode=rsvp` → `externalRegistrationUrl` hidden + disabled; `external` shows it. **Review Focus 2:** edit values `{format: "hybrid", onlineUrl: "https://x.test", registrationMode: "external", externalRegistrationUrl: "https://r.test"}` → both visible, enabled, populated on first render.
  - `canSubmit=false` → no "Submit for review" button and the `submitUnavailable` line present; exactly one `.button` in every case.
  - A hidden `input[name=heroMediaId]` exists; no visible text input named `heroMediaId`.
  - Contract: the set of named, non-disabled controls (all conditions true) equals the Global Constraints list + `intent`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/slug-from-title.test.ts tests/unit/portal-event-form.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Five `portal-fieldset`s per the spec; conditional fields use `hidden` + `disabled` driven by client state initialised from `values` (with JS off every field must be visible and enabled: apply the hiding only after hydration, e.g. a `hydrated` flag set in an effect, so the server HTML shows all fields); `slug` keeps its `pattern`. New page: `PortalPageHeader` (eyebrow `memberEvents.eyebrow`, title `newTitle`, lead `publishingFor`, quota as a child line); no-company / no-membership → `HonestEmpty` with a link back to `/portal/events`. Edit page: header with title `values.titleEn`, `StatusLabel` of the status, rejection reason in `.portal-form-alert`, context error in `.portal-form-alert role=alert`. Company picker: `portal-fieldset` with legend `chooseCompany`, warning as `portal-field-help`.
- [ ] **Step 4: Run** the new tests and the five kept-green files — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): event form with page address, conditional fields and image upload`

### Task 4: Directory

**Files:**
- Modify: `components/portal/directory-results.tsx`, `app/[locale]/(member)/portal/directory/page.tsx`, CSS, messages
- Create: `lib/portal/directory-paging.ts`
- Test: `tests/unit/portal-directory.test.tsx`, `tests/unit/directory-paging.test.ts`

**Interfaces:**
- Produces: `directoryPaging(input: {query: string; cursor: string | null; nextCursor: string | null}): {first: {q?: string} | null; next: {q?: string; cursor: string} | null}` — `first` non-null only when `cursor` is set and keeps `q` when non-empty; `next` only when `nextCursor`.
- Labels: rename `previous` → `first` ("Back to first page"); add `showingFor` ("Showing results for "{query}""), `clear` ("Clear search"), `emptyQuery` ("No members match "{query}""), `emptyNone` ("Members appear here once they choose to be listed."), `emptyNoneAction` ("Update your profile").

- [ ] **Step 1: Failing tests** — paging: page 1 no `first`; cursor page has `first`; **Review Focus 4:** `{query:"robotics", cursor:"c1"}` → `first = {q:"robotics"}`; `next` only with `nextCursor`. Render: search input has a `<label>`; active query shows `showingFor` + "Clear search" link to `/portal/directory`; cards render a `dl` with company/industry/size terms and no "Company:" prefix; "Next page" after "Back to first page" in DOM order; empty-with-query and empty-without-query `HonestEmpty` variants (the latter links `/portal/profile`).
- [ ] **Step 2: Run** `npx vitest run tests/unit/directory-paging.test.ts tests/unit/portal-directory.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Header eyebrow `Portal.navGroups.benefits`, title `directory.title`, lead `directory.description`.
- [ ] **Step 4: Run** the same command plus `tests/unit/public-directory-availability.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): directory search, cards and honest paging`

### Task 5: Documents

**Files:**
- Modify: `components/portal/document-list.tsx`, `app/[locale]/(member)/portal/documents/page.tsx`, CSS, messages
- Test: `tests/unit/portal-documents.test.tsx`

**Interfaces:**
- Labels become `{receiptsHeading: "Receipts"; resourcesHeading: "WTIA resources"; openReceipt: "Open receipt"; openDocument: "Open document"; newTab: string}`; empty uses `HonestEmpty` title `documents.empty`, line `documents.emptyLine` ("Receipts appear here after your first payment."), action `documents.emptyAction` ("Go to billing") → `/portal/billing`.

- [ ] **Step 1: Failing tests** — a receipt row's action reads "Open receipt", a resource row's "Open document"; groups render only when non-empty, in order Receipts then WTIA resources; date is `formatPortalDate` long form (no `9/1/2026`); item without `url` has no action; item without `issuedAt` has no date; external action has `target=_blank`, `rel~=noopener` and the new-tab sr text; empty state links to billing.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-documents.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Header eyebrow `Portal.navGroups.benefits`, title/lead existing keys; remove the now-unused `documents.receipt` / `resource` / `open` keys if nothing else reads them (grep `app components lib tests`).
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): documents grouped, labelled by kind, long dates`

### Task 6: Tools list and tool page

**Files:**
- Modify: `config/member-tools.ts` (add `descriptionKey`), `app/[locale]/(member)/portal/tools/page.tsx`, `.../tools/[key]/page.tsx`, CSS, messages
- Test: `tests/unit/portal-tools-list-page.test.tsx`, `tests/unit/portal-tool-detail-page.test.tsx`, `tests/unit/member-tools-config.test.ts` (update)

**Interfaces:**
- `MemberTool` gains `descriptionKey: string`; content calendar: `tools.contentCalendar.description` = "Plan and schedule your company's posts with WTIA's shared content calendar." (zh natural). Config stays relative-import / type-only as its comment requires.
- New keys: `tools.includedWith` ("Included with {plans}"), `tools.viewPlans` ("View membership options"), `tools.back` ("All tools").

- [ ] **Step 1: Failing tests** — config: every tool has a `descriptionKey` present in both message bundles. List: available card shows title, description, one `.button` "Open tool"; locked card shows `"Included with Startup, Corporate and Patron"` (plan names via `Portal.plans.*`, joined with the locale's list format) and a link to `/membership`, no "Open tool". Detail: available → back link to `/portal/tools`, `h1` tool name, `iframe.portal-frame` with `referrerPolicy="no-referrer"` and no `sandbox`; locked → `HonestEmpty` naming the plans; token missing → `HonestEmpty` with `tools.unavailableTitle`. Keep the existing assertions on token handling.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-tools-list-page.test.tsx tests/unit/portal-tool-detail-page.test.tsx tests/unit/member-tools-config.test.ts tests/unit/member-tools-csp.test.ts tests/unit/portal-member-tools.test.ts` — Expected: FAIL (new assertions).
- [ ] **Step 3: Implement.** Plan list via `new Intl.ListFormat(locale, {style: "long", type: "conjunction"})`.
- [ ] **Step 4: Run** the same command — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): tools with descriptions, plan-named locks and a framed tool page`

### Task 7: Billing

**Files:**
- Create: `lib/portal/billing-period.ts`
- Modify: `components/billing/billing-actions.tsx`, `app/[locale]/(member)/portal/billing/page.tsx`, CSS, messages
- Test: `tests/unit/billing-period.test.ts`, `tests/unit/portal-billing-actions.test.tsx` (update + extend)

**Interfaces:**
- Produces: `billingPeriodLine(record: {billingPeriodEnd: Date | string | null; cancelAtPeriodEnd: boolean} | undefined): {kind: "renews" | "ends"; date: Date} | null`.
- `BillingActions` gains prop `details: Readonly<Record<string, {period: {kind; date} | null; seatLimit: number | null}>>` keyed by membership id, built in the page from `getDashboard(actor).memberships` (read in `Promise.all` with the summary; a dashboard failure → `{}` via `.catch`). New label keys: `billing.renewsOn` ("Renews on {date}"), `billing.endsOn` ("Ends on {date}"), `billing.seats` ("{count} seats"), `billing.manageHelp` ("Opens Stripe's secure page to update your card, download invoices or cancel."), `billing.pastDue` ("Your last payment did not go through. Update your payment method to keep your membership active.").

- [ ] **Step 1: Failing tests** — `billingPeriodLine`: null end → null; **Review Focus 5:** `undefined` record → null; `cancelAtPeriodEnd` → `ends`, else `renews`. Render: plan name as heading, `StatusLabel` status; "Renews on 12 November 2026" / "Ends on …" / omitted; "3 seats" when `seatLimit` set; `manageHelp` shown only beside "Manage billing"; `past_due` → `.portal-form-alert` with `pastDue`; `providerUnavailable` muted `role=status`; exactly one `.button` per card; empty → `HonestEmpty` linking `/membership`. Page: `?error=1` renders `.portal-form-alert role=alert`.
- [ ] **Step 2: Run** `npx vitest run tests/unit/billing-period.test.ts tests/unit/portal-billing-actions.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement.** Keep the page's server-action construction and recovery logic unchanged; only the markup around it changes.
- [ ] **Step 4: Run** the same command plus `tests/unit/join-billing-pages.test.tsx tests/unit/audit-full-billing-recovery.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(portal): billing cards with renewal, seats and what Manage billing opens`

### Task 8: Visual, accessibility and zh-HK checks

**Files:**
- Modify: `tests/unit/portal-render-fixtures.test.tsx`, `tests/e2e/portal-experience.spec.ts`, `app/styles/wisetech-portal.css` (fixes only)

- [ ] **Step 1: Extend fixtures** (names suffixed `-en` / `-zh`): `events-list-own` (own events incl. rejected), `events-list-plain` (no own section), `event-new`, `event-edit-rejected`, `directory-results`, `directory-no-hits`, `directory-page2`, `documents-both`, `documents-empty`, `tools-available`, `tools-locked`, `tool-page`, `billing-active`, `billing-ending`, `billing-past-due`, `billing-error`.
- [ ] **Step 2: Extend the spec** — each at 1440×900 and 390×844 with the existing assertions (no horizontal scroll, no text under 11px, targets ≥24×24, axe wcag2a/2aa/21aa no critical/serious, every non-hidden control labelled, control count > 0 on `event-*` and `directory-*` fixtures, no untranslated `Portal.` paths, status-label guard); screenshots to `test-results/portal/`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/portal-render-fixtures.test.tsx` then `PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/portal-experience.spec.ts --project=chromium` — Expected: PASS after fixes. Read every new screenshot (en and zh, both widths), fix visible problems in CSS, list each in the report.
- [ ] **Step 4: Commit** `test(portal): events, directory, documents, tools, billing visual and zh-HK checks`

### Task 9: Gates and pull request

- [ ] **Step 1: Run** `npm run typecheck && npm run lint && npm run audit:strings && npx vitest run && npm run build` — Expected: clean (lint 0 errors). Restore `next-env.d.ts` and the CRLF-only email snapshot before staging; stage explicitly.
- [ ] **Step 2: Push and open the PR with base `feat/portal-forms`**, body listing changes, verification and the spec's owner walk-through as a checklist; note it is stacked on #166 (itself on #165).
- [ ] **Step 3:** Do not merge or promote; the owner walk-through comes first.
