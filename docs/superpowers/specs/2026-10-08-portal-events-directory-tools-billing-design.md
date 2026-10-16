# Member portal — events, directory, documents, tools, billing (sub-projects 3 + 4 of 4)

Date: 2026-10-08 · Status: design approved in conversation, awaiting written-spec review
Builds on: `2026-10-08-portal-shell-dashboard-design.md` (PR #165) and
`2026-10-08-portal-forms-design.md` (PR #166)

## Purpose

The last seven portal pages — events list, new event, edit event, directory, documents, tools (list and
tool page), billing — still use generic Tailwind panels and carry journey problems visible in
`test-results/portal/*-1440.png` / `*-390.png`:

- the event form asks for a **"URL slug"** and a **"Hero image id"**; the Chinese title sits alone on
  its row; "Online link" and "External registration link" are always shown even when they do not apply;
- event cards prefix "Date:" / "Venue:"; external registration is styled unlike the Register button;
- the directory shows **"Next page" on the left and "Previous page" on the right, always**, and
  "Previous" actually returns to the first page;
- documents label a **resource "Open receipt"** and print dates as `9/1/2026`;
- tools and billing are single thin cards — billing shows "STARTUP / Active" with no renewal date and no
  hint of what "Manage billing" opens.

**Scope** (owner, 2026-10-08): restyle **and** fix these journey problems in one spec and one PR, without
data, query, action-contract, authorization or migration changes. New features (directory filters,
calendar view, receipt downloads) are out of scope.

## Constraints

- Every form keeps its field `name`s, server action, `intent` values, validation and permission
  behaviour. The event form's submitted names stay exactly those `lib/events/member-contract.ts` reads.
- Reads use only existing functions: `getMemberEvents`, `listMyCompanyEvents`,
  `loadMemberEventsContext`, `searchDirectory`, `getDocuments`, `getDashboard`, `getBillingSummary`.
- Token handling in the tool page (`memberToolsEnv`, `toolFrameSrc`, `referrerPolicy="no-referrer"`, no
  `sandbox`) is unchanged and keeps its comments.
- Every visible string in `messages/en.json` and `messages/zh-HK.json`, in parity; `audit:strings` passes.
- Portal links stay `prefetch={false}` (`PrivateLink`); locale paths via `localizedPath`.
- Styles only in `app/styles/wisetech-portal.css`, scoped under `.portal-root`.
- The agent cannot sign in: verification is rendered fixtures plus an owner walk-through.
- Branch `feat/portal-events-directory-tools-billing`, stacked on `feat/portal-forms` (#166); the PR
  targets that branch until #166 merges.

## Design

### 1. Shared rules (all seven pages)

- **Page heading:** the dashboard pattern — `StatusLabel` eyebrow, `.portal-welcome` h1, `.portal-welcome-lead`
  line. Today's duplicated eyebrow-equals-title pairs ("BILLING / Billing") get a distinct eyebrow
  (the nav group, e.g. "Membership benefits") or none.
- **Cards:** the public `inner-card` look, replacing `glass-card`.
- **Dates:** long Hong Kong format everywhere (`Intl.DateTimeFormat(locale, {dateStyle: "long",
  timeZone: "Asia/Hong_Kong"})`).
- **Empty states:** the `honest-empty` block, each with one next step.
- **Errors:** `portal-form-alert` (sub-project 2); status words as `status-label`, sentences as body text.
- **Forms:** the sub-project 2 grammar (`portal-form`, `portal-fieldset`, `portal-field`, `portal-pair`,
  `portal-form-actions`, `PortalImageField`); exactly one primary action per form.

### 2. Events

**List (`/portal/events`)**
- *WTIA events:* each card has a date block (day numeral + month) beside the title, then the venue —
  no "Date:" / "Venue:" prefixes.
- One registration control per card in one grammar: RSVP is the primary `.button`; external
  registration and ticketed events are a `.text-link` with an outbound arrow (external keeps
  `rel="noopener noreferrer" target="_blank"` plus a visually hidden "(opens in a new tab)");
  "registration unavailable" is a muted note. Registration results keep `role="status"`.
- *Your organisation's events* (rendered only when `listMyCompanyEvents` returns a value): section
  heading with "Submit an event" as its one primary action and the quarterly quota line
  ("1 of 2 reviewed events used this quarter", from `loadMemberEventsContext`; omitted if that read
  fails). Each card shows its status label (Draft / Under review / Published / Changes needed), the
  long date, "Edit", and — for changes needed — the rejection reason as body text.
- Empty WTIA list: honest-empty pointing to the public events page.

**Form (new and edit) — same names, same `saveMemberEventAction`**, five fieldsets:
1. *Basics* — `titleEn` / `titleZh` paired on one row; then **Page address** (`slug`): on the new
   page it is prefilled from the English title as the member types (lowercase, ASCII letters and
   digits, hyphens) and shows the resulting `/events/<address>`; it stops following the title as soon
   as the member edits it. On the edit page it never changes automatically.
2. *Description* — `descriptionEn`, `descriptionZh`.
3. *When and where* — `startsAt` / `endsAt` paired; `venue` / `capacity` paired; `format`;
   `onlineUrl` shown only when format is online or hybrid — otherwise hidden **and disabled**, so it is
   not submitted (the parser treats it as optional).
4. *Registration* — `visibility`, `registrationMode`; `externalRegistrationUrl` shown only when the
   mode is external (hidden and disabled otherwise).
5. *Image and tags* — `PortalImageField` for `heroMediaId` (hidden input keeps the name; upload
   disabled when the plan allows no uploads, as today's `canUploadHero`); `tags` as a text input with
   "Separate with commas" helper.

Buttons: "Save draft" (secondary) + "Submit for review" (primary) over the unchanged `intent`.
When `canSubmit` is false the submit button is not rendered and one line says why (quota used).
The edit page shows the event's status label and rejection reason above the form. The company
picker (members managing several companies) is restyled as a fieldset; its warning text is kept.
The no-company / no-membership states use honest-empty.

With JavaScript off, every field is visible (conditional hiding is applied on the client), so the
form still works.

### 3. Directory

- Search: one labelled 52px input with the button beside it (desktop) or below it (phone). When a
  search is active: "Showing results for "x"" and a "Clear search" link.
- Cards (`inner-card`): name (serif), job title, then company, industry and company size as a small
  definition list (muted term above value). Two columns on desktop, one on phones.
- Paging (cursor-based; no true previous page): "Next page" on the right, only when `nextCursor`
  exists; "Back to first page" on the left, only when a cursor is in the URL. Same URLs and params.
- Empty: with a query — honest-empty "No members match "x"" with "Clear search"; without — a line that
  members appear here once they opt in, linking to Profile.

### 4. Documents

- Grouped under serif subheadings **Receipts** and **WTIA resources** (a group renders only when it
  has items).
- Each row: title, long date, and an action naming what it opens — "Open receipt" or "Open document";
  external links keep `target="_blank"` with a visually hidden "(opens in a new tab)".
- Empty: honest-empty saying receipts appear after the first payment, linking to Billing.

### 5. Tools

- *List:* each tool an `inner-card` with its name, a one-line description (new `descriptionKey` on
  `MemberTool` in `config/member-tools.ts` — a message key, no secret; the module stays importable by
  `next.config.ts`), and "Open tool" as the primary action. Locked: names the plans that include it
  (from the tool's `tiers`, via `Portal.plans.*`) and links "View membership options".
- *Tool page:* a slim header ("← All tools", tool name) and the frame filling the remaining height.
  No "open in new tab" (it would put the token URL into history). Locked and unavailable states use
  honest-empty with one next step.

### 6. Billing

- One card per membership: plan name (serif), status as `status-label`, and a record row —
  "Renews on {date}" or, when `cancelAtPeriodEnd`, "Ends on {date}" — plus "{n} seats", taken from
  `getDashboard()` memberships matched by id. A missing value is omitted, never guessed.
- Action keeps today's recovery logic and labels. "Manage billing" carries one line: it opens
  Stripe's secure page to update the card, download invoices or cancel. Past due shows an alert line
  above the action. "Provider unavailable" is a muted status line.
- `?error=1` renders in `portal-form-alert`. Empty: honest-empty with "View membership options".

## Verification

**Unit (Vitest):**
- Event form: page address follows the English title until edited; never auto-changes on edit;
  `onlineUrl` / `externalRegistrationUrl` hidden and disabled unless their condition holds; submit
  hidden with an explanation when `canSubmit` is false; image field keeps `heroMediaId`.
- Form contract: the event form's submitted names equal those `lib/events/member-contract.ts` reads.
- Directory: page 1 has no "Back to first page"; a cursor page has it; "Next page" only with
  `nextCursor`; empty with and without a query.
- Documents: action label per kind; grouping; long date.
- Billing: "Renews on" vs "Ends on"; omitted when no period end; past-due alert; error alert.
- Tools: locked card names the plans; tool page states.
- Kept green, updated only where bound to old markup: existing events, directory, documents, tools,
  billing and `private-link-boundary` tests.

**Visual and accessibility** — extend `tests/unit/portal-render-fixtures.test.tsx` and
`tests/e2e/portal-experience.spec.ts`, en and zh-HK, 1440 and 390: events list (with own events
incl. changes needed; without), new event, edit event, directory (results, no hits, page 2),
documents (both kinds, empty), tools (available, locked), tool page, billing (active, ending,
past due, error). Existing assertions (no horizontal scroll, no text under 11px, targets ≥ 24px, axe
without critical/serious, every control labelled, control count > 0 on form fixtures, no untranslated
`Portal.` paths).

**Gates:** typecheck, lint, `audit:strings`, full unit suite, build.

**Owner walk-through before promotion** (signed in, desktop and phone): register for an event; submit
an event with a hero image; edit it; search the directory and page through it; open a document; open
a tool; open Manage billing.

## Out of scope

Directory filters, an events calendar, receipt downloads, new actions, data or migration changes,
admin, the public site.
