# Member portal — forms: profile, company, showcase listing, seats (sub-project 2 of 4)

Date: 2026-10-08 · Status: design approved in conversation, awaiting written-spec review
Builds on: `docs/superpowers/specs/2026-10-08-portal-shell-dashboard-design.md` (PR #165)

## Purpose

Sub-project 1 gave the portal the WiseTech shell and dashboard. The pages members edit their account
from still use generic Tailwind forms — grey filled inputs, bold serif headings at Tailwind sizes, the
browser's own file picker, mixed button styles — and carry journey problems the rendering shows
(`test-results/portal/company-1440.png`, `company-listing-1440.png`, `company-seats-390.png`):

- the company page asks members to type a **"Logo image id"** and the listing a **"Logo reference"**:
  internal identifiers nobody outside the system can know;
- the company page has **three save buttons in two places** ("Save changes", "Save", "Publish my
  profile") with nothing saying which saves what;
- 27 industry tags with an **"up to 8" limit stated only in the label**;
- the listing form is **17 fields in one undifferentiated grid**, English and Chinese out of step;
- on a phone the **seats table hides its role and revoke controls off-screen**, and the invite form
  is offered **when every seat is already used** ("3 of 3 seats reserved").

**Scope** (owner, 2026-10-08): restyle **and** fix these journey problems, without changing data
structures or server-action input contracts.

## Constraints

- Every form keeps its field `name`s, its server action, its `intent` values, its validation and
  its permission behaviour (read-only roles still cannot edit). No query, repository, authorization
  or migration change.
- Every visible string in `messages/en.json` and `messages/zh-HK.json`, in parity;
  `npm run audit:strings` passes.
- Links into the portal stay `prefetch={false}` (enforced by `tests/unit/private-link-boundary.test.tsx`).
- The agent cannot sign in; verification is by rendered fixtures plus an owner walk-through.
- Branch `feat/portal-forms`, stacked on `feat/portal-shell-dashboard` (PR #165); its PR targets that
  branch until #165 merges, then is rebased onto `main`.

## Design

### 1. Shared form grammar

One set of portal form styles in `app/styles/wisetech-portal.css`, visually matching the public
site's forms (the `/events` filter panel, the `/launchpad` funding form, the `/contact` composer).
Forms change classes, not structure.

- **Field** — 13px bold label above the control; helper text and error below it.
  Controls: white ground, 1px `--wt-line` border, 8px radius, min-height 52px, 15px text, the
  public focus ring. **Disabled** (read-only role): grey ground and one line saying only owners and
  admins can edit, in place of today's half-opacity fields.
- **Groups** — each form is divided into `fieldset`s with a serif subheading. **Bilingual fields are
  always paired, English left and Chinese right on one row**; on phones they stack, English first.
- **Checkbox groups** — three columns, 24px boxes. Where a limit applies, a live counter ("3 / 8")
  and the remaining boxes disable once the limit is reached.
- **Image field** — the raw identifier inputs go. In their place: a preview, "Upload a new one" (the
  existing `HeroUpload`, restyled, file picker included) and "Remove". The value travels in a hidden
  input **with the original name**, so the action contract is unchanged:
  - company logo: `logoMediaId` (a media UUID); preview `/api/media/{id}`;
  - listing logo: `logoReference`; an upload writes `/api/media/{id}`, which the existing
    `isSafeLogoReference` (`lib/showcase/contracts.ts:26`) already accepts as a site-relative path.
    A stored external `https:` value is shown as text with "Remove", never loaded as an image.
- **Buttons** — the primary action is the public `.button`; secondary actions are `.text-link` or
  the outlined button. Exactly one primary action per form.
- **Status messages** — saved / submitted / error states in the public `status-label` grammar,
  keeping their existing `role="status"` / `role="alert"`.
- **Page headings** — the welcome-band heading scale and eyebrow from sub-project 1, so these pages'
  titles match the dashboard.

### 2. Page by page

1. **Profile** — groups "Contact" (name, job title, phone) and "WhatsApp updates" (number and consent,
   the existing box restyled); the directory-visibility switch last, with a one-line explanation.
   One primary "Save changes".
2. **Company** — two sections, each with a heading and a one-line purpose:
   - **Company details** (used for membership and seats): legal name, display name, website,
     industry, size, description. One primary "Save changes".
   - **Public member page** (reviewed by WTIA before it goes live): a status label at the top —
     Hidden / Under review / Live / Changes needed, with the rejection reason — and "View public
     page"; then page address; English and Chinese tagline on one row; Chinese description; industry
     tags with the counter; the logo image field. Buttons **"Save draft"** (secondary) and **"Submit
     for review"** (primary) — the listing page's wording — over the unchanged `intent=save` /
     `intent=publish`.
3. **Showcase listing** — seventeen fields in five groups:
   - *Basics* — page address, category;
   - *Name and tagline* — English and Chinese on the same rows;
   - *Descriptions* — English and Chinese;
   - *Details* — use cases, deployment options, supported languages, works with: still
     comma-separated inputs, with "Separate with commas" as helper text instead of
     "(comma separated)" in the label;
   - *Links and media* — video URL, case-study URL, case-study summary in English and Chinese,
     the logo image field.
   "Save draft" / "Submit for review" as today.
4. **Seats** — on phones the member and invitation tables become stacked rows (email, role, actions
   in one column) so no control is off-screen; desktop keeps the tables. The capacity line
   (`used = members + invitations`, `limit = overview.seatLimit`) gains a small progress bar.
   **When `used >= limit`** the invite form is not rendered; a note says all seats are in use and
   that removing a member or a pending invitation frees one. No new link or feature.
5. **Accept invitation** — its three error states use the honest-empty block, each with one next
   step (back to the dashboard).

New and changed copy is added in both locales; existing field labels are reused except the removed
"Logo image id" / "Logo reference" labels and the "(comma separated)" wording.

## Verification

**Unit (Vitest):**
- Image field: an existing `logoMediaId` shows the `/api/media/{id}` preview; an upload sets the
  hidden input (the UUID for the company logo, `/api/media/{id}` for the listing); "Remove" empties
  it; an external `https:` `logoReference` renders as text, not an `img`; the hidden input keeps its
  original name.
- Tag limit: at 8 checked, the unchecked boxes are disabled; unchecking one re-enables them; the
  counter text follows.
- Seats: `used >= limit` renders the note and no invite form; below the limit the form renders.
- Company page: each section has exactly one primary button; the public-page buttons still submit
  `intent=save` / `intent=publish`.
- **Form contracts:** each form's submitted field names match what the existing parsers read
  (`lib/portal/company-profile-actions.ts`, `lib/showcase/member-contract.ts`, the profile and seat
  actions), so a restyle cannot silently break a submission.
- Kept green, updated only where bound to old markup: `portal-profile-whatsapp`, `company-profile-core`,
  `seat-invitation-errors`, `seat-invitation-route`, `seat-service`, `private-link-boundary`,
  `internal-shell-landmark-contract`.

**Visual and accessibility** — extend `tests/unit/portal-render-fixtures.test.tsx` and
`tests/e2e/portal-experience.spec.ts` with these pages at 1440 and 390: company editable and
read-only, with and without a logo; seats with room and full; listing as a draft; profile; accept
invitation in an error state. The existing assertions (no horizontal scroll, no text under 11px,
targets ≥ 24px, axe without critical or serious violations) plus: **every form control has an
associated label**. **zh-HK fixtures** are added for each page (deferred from sub-project 1) to
check bilingual pairing and Chinese wrapping.

**Gates:** typecheck, lint, `audit:strings`, full unit suite, build.

**Owner walk-through before promotion** (signed in, desktop and phone): edit the profile; update
company details; on the public member page upload and remove a logo, try a ninth tag, save a draft,
submit for review; on the listing save and submit; on seats invite someone, and see the note when
full.

## Out of scope

Events, directory (sub-project 3); documents, tools, billing (sub-project 4); new fields, new
actions, data or migration changes; admin.
