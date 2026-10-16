# Member Portal Forms Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the portal's profile, company, showcase-listing, seats and accept-invitation pages onto the WiseTech form grammar and fix their journey problems, without changing any field name, action, intent, validation or permission.

**Architecture:** One portal form grammar in `app/styles/wisetech-portal.css` plus two small client primitives (`PortalImageField`, `PortalTagPicker`) in `components/portal/forms/`; each page swaps its Tailwind classes for the grammar and is regrouped into fieldsets. A form-contract test per form pins the submitted field names to what the existing server-action parsers read.

**Tech Stack:** Next.js 16 App Router (webpack), React 19, TypeScript strict, next-intl v4, Vitest + Testing Library, Playwright + @axe-core/playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-portal-forms-design.md` (builds on `docs/superpowers/specs/2026-10-08-portal-shell-dashboard-design.md`)

## Global Constraints

- Branch `feat/portal-forms`, stacked on `feat/portal-shell-dashboard` (PR #165).
- Every form keeps its field `name`s, server action, `intent` values (`save` / `publish`), validation and read-only behaviour. No query, repository, authorization or migration change.
- Every visible string in `messages/en.json` and `messages/zh-HK.json` with the same keys (both CRLF; preserve). `npm run audit:strings` passes. The `Portal` namespace is outside `page-copy-scope`'s pinned count.
- Portal links stay `prefetch={false}` (`tests/unit/private-link-boundary.test.tsx`).
- Styles only in `app/styles/wisetech-portal.css`, scoped under the portal root class, tokens `--wt-*` / `--xp-*` only.
- Form grammar values: label 13px bold above the control; control white ground, 1px `--wt-line` border, 8px radius, min-height 52px, 15px text; checkbox 24px; one primary `.button` per form; secondary `.text-link` or outlined button.
- Bilingual pairs: English left, Chinese right on one row; stacked English-first on phones (≤820px).
- Image field: hidden input keeps the original name (`logoMediaId` for the company, `logoReference` for the listing); preview src `/api/media/{id}`; listing uploads store `/api/media/{id}`; an external `https:` `logoReference` is shown as text, never as an `img`.
- Tag limit: 8.
- Every page in scope uses the dashboard's heading scale and eyebrow for its title (Tasks 3–6); saved / submitted / error messages use the `status-label` grammar and keep their existing `role="status"` / `role="alert"`.
- Seats full when `members.length + invitations.length >= overview.seatLimit`.
- Do not touch events, directory, documents, tools, billing, admin, or the dashboard.

## Review Focus

- **Read-only role on every form** — controls disabled, the read-only note shown, the image field shows no Upload/Remove, the tag picker is fully disabled (tests in Tasks 1, 2 and 4).
- **A company with no logo** — the image field shows the empty state, and saving submits `logoMediaId=""` exactly as today (tests in Tasks 1 and 4).
- **More than 8 tags already stored** (legacy data) — every stored tag stays checked and submitted; only unchecked boxes are disabled (test in Task 2).
- **Upload failure** — the hidden input keeps its previous value and the existing failed status shows (test in Task 1).
- **Seats exactly at the limit vs one under** — 3/3 hides the form, 2/3 shows it (test in Task 6).

---

### Task 1: Form grammar and the image field

**Files:**
- Create: `components/portal/forms/image-field.tsx` (`'use client'`)
- Modify: `app/styles/wisetech-portal.css` (append a "Form grammar" section), `messages/en.json`, `messages/zh-HK.json` (`Portal.forms`)
- Test: `tests/unit/portal-image-field.test.tsx`

**Interfaces:**
- Consumes: `HeroUpload({labels: HeroUploadLabels, onUploaded(id: string)})` from `components/portal/hero-upload.tsx`.
- Produces:
  ```ts
  export type PortalImageFieldLabels = Readonly<{label: string; empty: string; previewAlt: string; external: string; remove: string; upload: HeroUploadLabels}>;
  export function PortalImageField(props: Readonly<{name: "logoMediaId" | "logoReference"; initialValue: string; store: "id" | "path"; readOnly: boolean; labels: PortalImageFieldLabels}>): JSX.Element;
  ```
  `store: "id"` writes the uploaded id; `store: "path"` writes `/api/media/{id}`. CSS class names produced for later tasks: `portal-form`, `portal-fieldset`, `portal-fieldset-title`, `portal-field`, `portal-field-help`, `portal-pair` (two-column bilingual row), `portal-checks`, `portal-form-actions`, `portal-readonly-note`.
- Copy (en / zh-HK): `Portal.forms.readOnlyNote` "Only company owners and admins can edit these details." / "只有公司擁有人及管理員可以編輯這些資料。"; `Portal.forms.image.empty` "No logo yet" / "尚未有標誌"; `previewAlt` "Current logo" / "目前標誌"; `external` "Linked image" / "外部連結圖片"; `remove` "Remove" / "移除"; `Portal.forms.commaHelp` "Separate with commas" / "以逗號分隔"; `Portal.forms.tagCounter` "{count} / {max} selected" / "已選 {count} / {max}".

- [ ] **Step 1: Write the failing tests** — `PortalImageField`:
  - `initialValue` a UUID, `store: "id"` → an `img` with `src="/api/media/<uuid>"` and `alt` = `previewAlt`, and a hidden input `name="logoMediaId"` with that value;
  - `initialValue ""` → the `empty` text, no `img`, hidden input value `""`;
  - `name="logoReference"`, `initialValue "https://cdn.example.com/a.png"` → the `external` label and the URL as text, no `img`;
  - `name="logoReference"`, `initialValue "/api/media/<uuid>"` → `img` preview;
  - clicking Remove empties the hidden input and shows the empty state;
  - mocked upload (`fetch` resolving `{id}`) with `store: "path"` → hidden value `/api/media/<id>`; with `store: "id"` → `<id>`;
  - mocked upload failing (`ok: false`) → hidden value unchanged (Review Focus 4);
  - `readOnly` → no Remove button and no file input.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-image-field.test.tsx` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `PortalImageField` (state = current value; preview only when the value is a UUID with `store: "id"` or starts with `/api/media/`; render `HeroUpload` when not read-only) and the grammar CSS with the values in Global Constraints, restyling `HeroUpload`'s file input and button through the field's class (no change to `hero-upload.tsx` logic). Add the copy.
- [ ] **Step 4: Run** the test, `npm run typecheck`, `npm run audit:strings` — Expected: PASS, clean.
- [ ] **Step 5: Commit** — `feat(portal): form grammar and an image field that hides internal ids`

### Task 2: Tag picker with a limit

**Files:**
- Create: `components/portal/forms/tag-picker.tsx` (`'use client'`)
- Test: `tests/unit/portal-tag-picker.test.tsx`

**Interfaces:**
- Produces: `export function PortalTagPicker(props: Readonly<{name: string; legend: string; options: readonly {value: string; label: string}[]; initial: readonly string[]; max: number; readOnly: boolean; counterLabel: (count: number, max: number) => string}>): JSX.Element` — a `fieldset.portal-checks` of checkboxes named `name`, a live counter (`aria-live="polite"`).

- [ ] **Step 1: Write the failing tests:** with `max: 8` and 3 initial → counter "3 / 8 selected", all boxes enabled; checking up to 8 disables every unchecked box; unchecking one re-enables them; 10 initial (legacy) → all 10 checked and enabled, every unchecked box disabled, the submitted form data holds all 10 values (Review Focus 3); `readOnly` → every box disabled.
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-tag-picker.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** `PortalTagPicker` (controlled set of checked values; an unchecked box is disabled when `checked.size >= max`).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(portal): tag picker that shows and enforces the selection limit`

### Task 3: Profile page

**Files:**
- Modify: `app/[locale]/(member)/portal/profile/page.tsx`, `messages/*.json`, `app/styles/wisetech-portal.css`
- Test: `tests/unit/portal-profile-form.test.tsx` (create); keep green `tests/unit/portal-profile-whatsapp.test.ts`

**Interfaces:**
- Consumes: Task 1 grammar classes; the page's existing `updateProfileAction`.
- Copy: `Portal.profileGroups.contact` "Contact" / "聯絡資料"; `.whatsapp` "WhatsApp updates" / "WhatsApp 通知"; `.directoryHelp` "Lets other members find you in the WTIA directory." / "讓其他會員在 WTIA 名錄中找到你。"

- [ ] **Step 1: Write the failing tests** (render the page with the mocks `portal-dashboard-page.test.tsx` uses): two fieldsets with the group titles in order; the set of input `name`s equals exactly `displayName, phone, jobTitle, whatsappNumber, whatsappOptIn, locale, directoryVisible` (the form contract — confirm the list against what `updateProfileAction` reads before writing it); exactly one `button[type=submit]`; the directory checkbox's description is the `directoryHelp` text via `aria-describedby`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — page heading in the dashboard's heading scale and eyebrow; `form.portal-form` with "Contact" (`displayName`, `jobTitle`, `phone`) and "WhatsApp updates" (`whatsappNumber` + the existing consent box), then the directory switch with its help; one primary `.button`.
- [ ] **Step 4: Run** the new test and `portal-profile-whatsapp` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(portal): profile form in the WiseTech grammar`

### Task 4: Company page — details and public member page

**Files:**
- Modify: `app/[locale]/(member)/portal/company/page.tsx`, `components/portal/company-profile-form.tsx`, `messages/*.json`, `app/styles/wisetech-portal.css`
- Test: `tests/unit/portal-company-forms.test.tsx` (create); keep green `company-profile-core`, `company-profiles-repository`

**Interfaces:**
- Consumes: `PortalImageField` (`name="logoMediaId"`, `store: "id"`), `PortalTagPicker` (`name="tags"`, `max: 8`), grammar classes; existing `updateCompanyAction`, `saveCompanyProfileAction`.
- Copy: `Portal.companySections.details.title` "Company details" / "公司資料", `.details.purpose` "Used for your membership and seats." / "用於會籍及名額。", `.public.title` "Public member page" / "公開會員頁", `.public.purpose` "WTIA reviews this page before it goes live in the member directory." / "此頁面在會員名錄上線前會經 WTIA 審核。"; `Portal.companyProfile.statusLabel.hidden|pending_review|published|rejected` "Hidden" / "未公開", "Under review" / "審核中", "Live" / "已上線", "Changes needed" / "需要修改"; buttons reuse the listing's existing "Save draft" / "Submit for review" keys if they exist under `Portal.showcaseListing`, otherwise add `Portal.forms.saveDraft` / `Portal.forms.submitForReview` with those words / "儲存草稿" / "提交審核".

- [ ] **Step 1: Write the failing tests:**
  - details form: input names exactly as `updateCompanyAction` reads them today (derive from the action before writing the list); one primary submit;
  - public form: names `slug, website, taglineEn, taglineZhHk, descriptionZhHk, tags, logoMediaId` plus `companyId`/`locale` if present today — matching what `lib/portal/company-profile-actions.ts` reads; the two buttons are `name="intent"` with values `save` and `publish`, labelled "Save draft" and "Submit for review", "Submit for review" the only `.button`;
  - no visible text input named `logoMediaId` (it is hidden); the status label shows "Changes needed" plus the rejection reason for `rejected`;
  - read-only member: controls disabled, the read-only note present, no Upload/Remove (Review Focus 1); no logo: hidden `logoMediaId` value `""` (Review Focus 2).
- [ ] **Step 2: Run** `npx vitest run tests/unit/portal-company-forms.test.tsx` — Expected: FAIL.
- [ ] **Step 3: Implement** — two sections with headings and purposes; details as one fieldset; public page: status label + "View public page" (`prefetch={false}` if it is an internal link), fieldsets "Page address and links" (`slug`, `website`), "Tagline" (`taglineEn` | `taglineZhHk` as `portal-pair`), "Description" (`descriptionZhHk`), tags via `PortalTagPicker`, logo via `PortalImageField`; secondary "Save draft" + primary "Submit for review". Remove the visible `logoMediaId` text input.
- [ ] **Step 4: Run** the new test plus the keep-green tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(portal): company page in two clear sections, logo without internal ids`

### Task 5: Showcase listing form

**Files:**
- Modify: `components/portal/showcase-listing-form.tsx`, `app/[locale]/(member)/portal/company/listing/page.tsx`, `messages/*.json`
- Test: `tests/unit/portal-listing-form.test.tsx` (create)

**Interfaces:**
- Consumes: `PortalImageField` (`name="logoReference"`, `store: "path"`), grammar classes; the existing `submitAction`.
- Copy: `Portal.showcaseListing.groups.basics` "Basics" / "基本資料", `.nameTagline` "Name and tagline" / "名稱及標語", `.descriptions` "Descriptions" / "介紹", `.details` "Details" / "詳細資料", `.links` "Links and media" / "連結及媒體"; the four comma-separated labels drop "(comma separated)" in both locales and use `Portal.forms.commaHelp` as help text.

- [ ] **Step 1: Write the failing tests:** the set of submitted names equals what `lib/showcase/member-contract.ts` reads (derive the list from it); five fieldsets with the group titles in order; each English field and its Chinese twin are in the same `.portal-pair`; the four comma inputs have `aria-describedby` → the comma help; no visible text input named `logoReference`; "Save draft" / "Submit for review" keep their current `name`/`value`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** the five groups as the spec lists them.
- [ ] **Step 4: Run** — Expected: PASS; `npm run audit:strings` clean.
- [ ] **Step 5: Commit** — `feat(portal): showcase listing grouped, bilingual pairs aligned`

### Task 6: Seats and accept invitation

**Files:**
- Modify: `app/[locale]/(member)/portal/company/seats/page.tsx`, `components/portal/seat-table.tsx`, `components/portal/seat-invite-form.tsx`, `app/[locale]/(member)/portal/company/seats/accept/page.tsx`, `messages/*.json`, `app/styles/wisetech-portal.css`
- Test: `tests/unit/portal-seats-page.test.tsx` (create); keep green `seat-invitation-errors`, `seat-invitation-route`, `seat-service`

**Interfaces:**
- Copy: `Portal.seats.full` "All seats are in use. Remove a member or a pending invitation to invite someone else." / "所有名額已用完。移除一位成員或一個待處理邀請後，便可再邀請。"; `Portal.seats.acceptBack` "Back to dashboard" / "返回會員主頁".

- [ ] **Step 1: Write the failing tests:** limit 3 with 2 members + 1 invitation → the `full` note, no invite form; limit 3 with 2 + 0 → the invite form, no note (Review Focus 5); the capacity line has a `progressbar` with `aria-valuenow` = used and `aria-valuemax` = limit; each member row exposes email, role control and revoke control in DOM order (the phone stacked layout is CSS); invite form names unchanged (`email`, `role`, `companyId`, `locale` — confirm against the page's invite action); accept page error states render the `inner-honest` block with a link to `/portal`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement** — capacity bar; the full-state branch; the seat tables keep `<table>` semantics on desktop and, at ≤820px, CSS stacks each row's cells (`display: block` per row, `data-label` captions from the column headers); accept page errors via `HonestEmpty variant="inner"` plus the back link (`prefetch={false}`).
- [ ] **Step 4: Run** the new test plus the keep-green tests — Expected: PASS.
- [ ] **Step 5: Commit** — `feat(portal): seats show capacity, stop offering invites when full, stack on phones`

### Task 7: Visual, accessibility and zh-HK checks

**Files:**
- Modify: `tests/unit/portal-render-fixtures.test.tsx`, `tests/e2e/portal-experience.spec.ts`, `app/styles/wisetech-portal.css` (fixes only)

- [ ] **Step 1: Extend fixtures** — profile; company editable with a logo, editable without a logo, read-only; listing draft; seats with room and full; accept-invitation error — each in `en` and `zh-HK` (fixture names suffixed `-en` / `-zh`).
- [ ] **Step 2: Extend the spec** — for each new fixture at 1440×900 and 390×844: the existing assertions (no horizontal scroll, no text under 11px, targets ≥24×24, axe wcag2a/2aa/21aa no critical/serious) plus **every `input`, `select`, `textarea` not `type=hidden` has an accessible name** (`label[for]`, a wrapping `label`, or `aria-label`/`aria-labelledby`); screenshots to `test-results/portal/`.
- [ ] **Step 3: Run** `npx vitest run tests/unit/portal-render-fixtures.test.tsx` then `PLAYWRIGHT_BASE_URL=http://localhost:9 npx playwright test tests/e2e/portal-experience.spec.ts --project=chromium` — Expected: PASS after fixes. Read every new screenshot (en and zh) and fix in `wisetech-portal.css` what is visibly wrong; list each problem and fix in the report.
- [ ] **Step 4: Commit** — `test(portal): forms visual, label and zh-HK checks`

### Task 8: Gates and pull request

- [ ] **Step 1: Run** `npm run typecheck && npm run lint && npm run audit:strings && npx vitest run && npm run build` — Expected: clean (lint 0 errors). Restore `next-env.d.ts` and the CRLF-only email snapshot before staging; stage explicitly.
- [ ] **Step 2: Push and open the PR with base `feat/portal-shell-dashboard`**, body listing the changes, the verification, and the owner walk-through from the spec as a checklist; note that it is stacked on #165 and will be rebased onto `main` after #165 merges.
- [ ] **Step 3:** Do not merge or promote; the owner walk-through comes first.
