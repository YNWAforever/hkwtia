# Phase B2 — Public Member Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every member organisation an opt-in public page at `/members/[slug]` with logo, taglines, tags, its published showcase listing and its published events, reached from a filterable `/members` directory, reviewed by staff before it goes live, and described to search engines with `Organization` and `BreadcrumbList` JSON-LD.

**Architecture:** Additive `companies` columns (`slug`, `logo_media_id`, `tags`, bilingual taglines, `description_zh_hk`, `public_profile_status`, `public_profile_published_at`, reviewer columns) plus `leads.listing_id` nullable and `leads.contact_id`, generated with drizzle-kit and one custom slug backfill. The moderation loop copies the showcase pattern (`hidden → pending_review → published`, reviewer columns, admin review table) and writes audit rows. Public reads are anonymous repository methods scoped to `public_profile_status = 'published'`; portal writes go through company-manager checks; the temporary `/members` 307s in `next.config.ts` are removed and the design manifest re-pointed.

**Tech Stack:** Next.js 16 App Router (webpack) · React 19 · TypeScript strict · Drizzle ORM on Neon · next-intl v4 · Zod · Vitest · Playwright · `schema-dts`.

**Programme context:** spec §5 (`/members`, B-6 directory half, B-7, D-11). Companion plan: `2026-09-09-phase-b1-member-events.md`. Task 3 here reuses B1 Task 4's member upload route; land that task first if B1 has not merged (it is self-contained).

**Working rules for every task** — identical to `2026-09-09-phase-b1-member-events.md` (focused test first; `localizedPath`; no actor-taking `"use server"` exports; `requireAdminPageActor` first in admin pages; bundles in parity; drizzle-kit generated migrations, `--custom` only for backfills; `NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build` locally; commit per task).

**Scope decisions**
- S-1 `public_profile_status` defaults to `hidden` for every existing company (D-11); nothing becomes public without the owner submitting and staff approving.
- S-2 Slugs are generated once by the backfill (`lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))`, trimmed, de-duplicated with a numeric suffix) and thereafter owner-editable in the portal within the same regex; uniqueness is a partial unique index so legacy rows without a slug never collide.
- S-3 `/members` filters: `q` (name/tagline search), `tag`, `plan` (from the active membership). Listing order: patron and corporate first (D-5 "featured"), then name.
- S-4 The industry tag vocabulary lives in `config/industry-tags.ts` (24 slugs); the portal offers checkboxes from it; free text is rejected.

---

## File map

| Path | Task | Responsibility |
|---|---|---|
| `lib/db/schema-core.ts` (M), `drizzle/0028_phase_b_company_profiles.sql` (generated), `drizzle/0029_phase_b_company_slugs.sql` (custom), `tests/unit/schema-contract.test.ts` (M) | 1 | columns, enum, slug backfill |
| `config/industry-tags.ts` (C) | 2 | controlled vocabulary |
| `lib/db/repos/company-profiles.ts` (C), `lib/db/repos/index.ts` (M) | 2 | public reads, member profile writes, review |
| `lib/portal/company-profile-core.ts` (C), `lib/portal/company-profile-actions.ts` (C), `components/portal/company-profile-form.tsx` (C), `app/[locale]/(member)/portal/company/page.tsx` (M), `lib/portal/queries.ts` (M) | 3 | portal editing + submit for review |
| `lib/admin/profile-review-core.ts` (C), `lib/admin/profile-review-actions.ts` (C), `components/admin/profile-review-table.tsx` (C), `app/[locale]/(admin)/admin/profiles-review/page.tsx` (C), nav/inventory/pins (M) | 4 | staff review |
| `config/public-routes.ts` (M), `next.config.ts` (M), `config/wisetech-integration-manifest.ts` (M), `config/wisetech-authoritative-source-inventory.ts` (M), `drizzle/0030_phase_b_members_route.sql` (generated), `tests/unit/redirects.test.ts` (M), `tests/unit/wisetech-route-parity.test.ts` (M) | 5 | route becomes real |
| `lib/members/public.ts` (C), `components/marketing/member-filters.tsx` (C), `components/marketing/member-card.tsx` (C), `app/[locale]/(public)/members/page.tsx` (C), `app/[locale]/(public)/members/[slug]/page.tsx` (C), `lib/structured-data.ts` (M), `components/seo/structured-data.tsx` (M), `app/sitemap.ts` (M) | 6 | public pages + JSON-LD + sitemap |
| `tests/e2e/phase-b2-member-directory.spec.ts` (C) | 7 | acceptance |
| `messages/en.json`, `messages/zh-HK.json` (M) | 3, 4, 6 | `Members`, `Portal.companyProfile`, `Admin.profilesReview` |

---

### Task 1: Schema — company profile columns, leads contact link, slug backfill (D-11)

**Files:** `lib/db/schema-core.ts` (`companies` :135-147, `leads` :1007-1027, enums), `drizzle/0028_*`, `drizzle/0029_*` (custom), `tests/unit/schema-contract.test.ts`.

- [ ] **Step 1: Failing test** — append to `tests/unit/schema-contract.test.ts` (import `companies`, `leads`):

```ts
describe("phase B2 company profile contract", () => {
  it("adds public-profile columns and a partial unique slug", () => {
    for (const column of ["slug", "logoMediaId", "tags", "taglineEn", "taglineZhHk", "descriptionZhHk", "publicProfileStatus", "publicProfilePublishedAt", "profileReviewedAt", "profileReviewedByProfileId", "profileRejectionReason"] as const) {
      expect(companies[column]).toBeDefined();
    }
    expect(getTableConfig(companies).indexes.map((index) => index.config.name)).toContain("companies_slug_unique");
  });
  it("lets a lead exist without a listing and link to a contact", () => {
    expect(leads.listingId.notNull).toBe(false);
    expect(leads.contactId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run** `npx vitest run tests/unit/schema-contract.test.ts --reporter=dot` → FAIL.

- [ ] **Step 3: Schema** — add `export const publicProfileStatusEnum = pgEnum("public_profile_status", ["hidden", "pending_review", "published", "rejected"]);` beside the other enums; append to `companies`:

```ts
  // Programme D-11: the public member page. Opt-in, reviewed, hidden by default.
  slug: text("slug"),
  logoMediaId: uuid("logo_media_id").references((): AnyPgColumn => media.id, {onDelete: "set null"}),
  tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
  taglineEn: text("tagline_en"),
  taglineZhHk: text("tagline_zh_hk"),
  descriptionZhHk: text("description_zh_hk"),
  publicProfileStatus: publicProfileStatusEnum("public_profile_status").default("hidden").notNull(),
  publicProfilePublishedAt: timestamp("public_profile_published_at", {withTimezone: true}),
  profileReviewedAt: timestamp("profile_reviewed_at", {withTimezone: true}),
  profileReviewedByProfileId: text("profile_reviewed_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  profileRejectionReason: text("profile_rejection_reason"),
```

and give `companies` a third `pgTable` argument `(table) => [uniqueIndex("companies_slug_unique").on(table.slug).where(sql\`${table.slug} IS NOT NULL\`), index("companies_public_profile_idx").on(table.publicProfileStatus, table.displayName)]`. `media` is declared after `companies`, hence the typed lazy reference (`AnyPgColumn` is already imported). In `leads`: `listingId: uuid("listing_id").references(() => showcaseListings.id, {onDelete: "cascade"})` (drop `.notNull()`), add `contactId: uuid("contact_id").references((): AnyPgColumn => contacts.id, {onDelete: "set null"})`, and add `check("leads_identity_check", sql\`${table.listingId} IS NOT NULL OR ${table.contactId} IS NOT NULL\`)`. Types: `export type PublicProfileStatus = (typeof publicProfileStatusEnum.enumValues)[number];`.

- [ ] **Step 4: Generate** `npx drizzle-kit generate --config=drizzle.config.ts --name phase_b_company_profiles` → `0028` with the enum, eleven `ALTER TABLE "companies" ADD COLUMN`, the partial unique index, `ALTER TABLE "leads" ALTER COLUMN "listing_id" DROP NOT NULL`, the check. Then `npx drizzle-kit generate --config=drizzle.config.ts --custom --name phase_b_company_slugs` → `0029`, filled with:

```sql
-- Programme B-7 / S-2: one-time slug derivation; owners can edit afterwards.
WITH candidates AS (
  SELECT id,
         trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))) AS base,
         row_number() OVER (PARTITION BY trim(both '-' from lower(regexp_replace(display_name, '[^a-zA-Z0-9]+', '-', 'g'))) ORDER BY created_at, id) AS n
  FROM "companies" WHERE "slug" IS NULL
)
UPDATE "companies" c
SET "slug" = CASE WHEN candidates.n = 1 THEN candidates.base ELSE candidates.base || '-' || candidates.n END
FROM candidates
WHERE c.id = candidates.id AND length(candidates.base) BETWEEN 2 AND 96;
```

- [ ] **Step 5: Verify** `npx vitest run tests/unit/schema-contract.test.ts --reporter=dot && npm run typecheck`, then the disposable-container migration run (journal 29 rows; `SELECT slug FROM companies` non-null for seeded rows).

- [ ] **Step 6: Commit** — `git add lib/db/schema-core.ts drizzle tests/unit/schema-contract.test.ts && git commit -m "feat(db): public company profile columns, slug backfill, leads without listings (B-7, D-11)"`.

---

### Task 2: Vocabulary and repository (B-6, B-7)

**Files:** `config/industry-tags.ts` (C), `lib/db/repos/company-profiles.ts` (C), `lib/db/repos/index.ts` (M). Tests: `tests/unit/industry-tags.test.ts`, `tests/unit/company-profiles-repository.test.ts`.

- [ ] **Step 1: Failing tests**

```ts
// tests/unit/industry-tags.test.ts
import {describe, expect, it} from "vitest";

import {INDUSTRY_TAGS, isIndustryTag} from "@/config/industry-tags";

describe("industry tags (S-4)", () => {
  it("is a stable slug list with bilingual labels", () => {
    expect(INDUSTRY_TAGS.length).toBeGreaterThanOrEqual(20);
    for (const tag of INDUSTRY_TAGS) {
      expect(tag.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(tag.en.length).toBeGreaterThan(0);
      expect(tag.zhHk.length).toBeGreaterThan(0);
    }
    expect(isIndustryTag("ai")).toBe(true);
    expect(isIndustryTag("crypto-scams")).toBe(false);
  });
});
```

```ts
// tests/unit/company-profiles-repository.test.ts
import {describe, expect, it, vi} from "vitest";

import {createCompanyProfilesRepository} from "@/lib/db/repos/company-profiles";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const member = {kind: "member" as const, userId: "u", profileId: "m1"};
const staff = {kind: "staff" as const, userId: "s", profileId: "s1"};
const roles = async (actor: {profileId?: string}) => (actor.profileId === "m1" ? "owner" as const : null);
function db(rows: Record<string, unknown>[][]) {
  const queue = [...rows];
  const execute = vi.fn(async () => queue.shift() ?? []);
  return {execute, load: async () => ({execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})}) as never};
}
const profile = {slug: "acme", taglineEn: "Ships things", taglineZhHk: "運送", descriptionZhHk: null, tags: ["ai", "logistics"], logoMediaId: null, website: "https://acme.example"};

describe("companyProfilesRepository (programme B-6, B-7)", () => {
  it("public reads need no actor and only see published profiles", async () => {
    const {execute, load} = db([[{id: COMPANY, slug: "acme", display_name: "Acme", tagline_en: "x", tagline_zh_hk: "y", tags: ["ai"], website: null, plan_code: "corporate", logo_url: null}]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});
    const rows = await repository.listPublished({q: null, tag: null, plan: null});
    expect(rows[0]).toMatchObject({slug: "acme", name: "Acme", plan: "corporate"});
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("member updates require a manager role and reject unknown tags before any SQL", async () => {
    const {execute, load} = db([[{id: COMPANY, public_profile_status: "hidden"}]]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});
    await expect(repository.updateProfile({...member, profileId: "m2"}, COMPANY, profile)).rejects.toThrow("FORBIDDEN");
    await expect(repository.updateProfile(member, COMPANY, {...profile, tags: ["nope"]})).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    await expect(repository.updateProfile(member, COMPANY, profile)).resolves.toMatchObject({id: COMPANY});
  });

  it("submit moves hidden to pending_review; review publishes with an audit row in the same transaction", async () => {
    const pending = {id: COMPANY, public_profile_status: "pending_review", slug: "acme"};
    const {execute, load} = db([[pending], [pending], [{...pending, public_profile_status: "published"}], []]);
    const repository = createCompanyProfilesRepository({loadDatabase: load, getCompanyRole: roles});
    await expect(repository.submitForReview(member, COMPANY)).resolves.toMatchObject({public_profile_status: "pending_review"});
    await expect(repository.review(staff, COMPANY, {decision: "approve"})).resolves.toMatchObject({public_profile_status: "published"});
    expect(execute).toHaveBeenCalledTimes(4);
    await expect(repository.review(member, COMPANY, {decision: "approve"})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run** → FAIL (modules missing).

- [ ] **Step 3: Vocabulary**

```ts
// config/industry-tags.ts
export type IndustryTag = Readonly<{slug: string; en: string; zhHk: string}>;
const tag = (slug: string, en: string, zhHk: string): IndustryTag => Object.freeze({slug, en, zhHk});

/** S-4: the only tags a company profile may carry. Add here; never accept free text. */
export const INDUSTRY_TAGS: readonly IndustryTag[] = Object.freeze([
  tag("ai", "Artificial intelligence", "人工智能"), tag("iot", "Internet of Things", "物聯網"), tag("5g", "5G and telecoms", "5G 及電訊"),
  tag("fintech", "FinTech", "金融科技"), tag("healthtech", "HealthTech", "醫療科技"), tag("edtech", "EdTech", "教育科技"),
  tag("proptech", "PropTech", "地產科技"), tag("logistics", "Logistics and supply chain", "物流及供應鏈"), tag("smart-city", "Smart city", "智慧城市"),
  tag("cybersecurity", "Cybersecurity", "網絡安全"), tag("cloud", "Cloud and infrastructure", "雲端及基建"), tag("data", "Data and analytics", "數據及分析"),
  tag("robotics", "Robotics and automation", "機械人及自動化"), tag("hardware", "Hardware and devices", "硬件及裝置"), tag("mobile-apps", "Mobile apps", "流動應用"),
  tag("gaming", "Gaming and media", "遊戲及媒體"), tag("ecommerce", "E-commerce and retail tech", "電商及零售科技"), tag("greentech", "GreenTech", "綠色科技"),
  tag("govtech", "GovTech and public sector", "政府科技及公營"), tag("consulting", "Consulting and integration", "顧問及系統整合"), tag("investor", "Investor and accelerator", "投資者及加速器"),
  tag("academia", "Academia and research", "學術及研究"), tag("gba", "Greater Bay Area", "大灣區"), tag("web3", "Web3 and blockchain", "Web3 及區塊鏈"),
]);

const slugs = new Set(INDUSTRY_TAGS.map((entry) => entry.slug));
export function isIndustryTag(value: string): boolean { return slugs.has(value); }
export function industryTagLabel(slug: string, locale: "en" | "zh-HK"): string {
  const entry = INDUSTRY_TAGS.find((item) => item.slug === slug);
  return entry ? (locale === "zh-HK" ? entry.zhHk : entry.en) : slug;
}
```

- [ ] **Step 4: Repository** — `lib/db/repos/company-profiles.ts`, `import "server-only"`, `createCompanyProfilesRepository({loadDatabase?, getCompanyRole?, now?})` with the same `rowsFrom`/`memberDatabase`/`requireCompanyManager` helpers as B1 Task 2 (copy them; do not import from `events.ts`). Methods:

```ts
export type MemberFilters = Readonly<{q: string | null; tag: string | null; plan: MembershipPlanCode | null}>;
export type PublicMemberSummary = Readonly<{id: string; slug: string; name: string; tagline: Readonly<{en: string | null; zhHk: string | null}>; tags: readonly string[]; plan: MembershipPlanCode | null; website: string | null; logoUrl: string | null}>;
export type PublicMemberProfile = PublicMemberSummary & Readonly<{
  description: Readonly<{en: string | null; zhHk: string | null}>; industry: string | null; sizeBand: string | null;
  showcase: Readonly<{slug: string; name: string}> | null;
  events: readonly Readonly<{slug: string; titleEn: string; titleZh: string | null; startsAt: Date}>[];
}>;
```

  - `listPublished(filters: MemberFilters)` — no actor; `SELECT c.id, c.slug, c.display_name, c.tagline_en, c.tagline_zh_hk, c.tags, c.website, m.plan_code, md.url AS logo_url FROM companies c LEFT JOIN LATERAL (SELECT plan_code FROM memberships WHERE company_id = c.id AND status IN ('active','past_due','cancel_at_period_end') ORDER BY created_at DESC LIMIT 1) m ON true LEFT JOIN media md ON md.id = c.logo_media_id AND md.archived_at IS NULL WHERE c.public_profile_status = 'published' AND c.slug IS NOT NULL` plus `q` (`c.display_name ILIKE '%q%' OR c.tagline_en ILIKE … OR c.tagline_zh_hk ILIKE …`), `tag` (`c.tags @> ARRAY[tag]::text[]`), `plan` (`m.plan_code = plan`); `ORDER BY CASE m.plan_code WHEN 'patron' THEN 0 WHEN 'corporate' THEN 1 ELSE 2 END, c.display_name`; `q` is validated `≤120` chars, `tag` with `isIndustryTag`, `plan` against `MEMBERSHIP_PLAN_CODES`.
  - `getPublishedBySlug(slug)` — the same select for one slug (regex-validated) plus `description`, `description_zh_hk`, `industry`, `size_band`; then two more reads: the published showcase listing (`SELECT slug, name_en FROM showcase_listings WHERE company_id = $id AND status = 'published' LIMIT 1`) and upcoming published public events by organiser (`SELECT slug, title_en, title_zh, starts_at FROM events WHERE organiser_company_id = $id AND status = 'published' AND visibility = 'public' AND coalesce(ends_at, starts_at) >= now() ORDER BY starts_at LIMIT 6` — the `organiser_company_id` column arrives with B1 Task 1; if B1 has not landed, return `events: []` and note it). Returns `PublicMemberProfile | null`.
  - `listPublishedSlugs()` — for the sitemap.
  - `updateProfile(actor, companyId, input)` — `requireCompanyManager`; zod: `slug` regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` 2..96, `taglineEn`/`taglineZhHk` ≤160 nullable, `descriptionZhHk` ≤2000 nullable, `tags: z.array(z.string()).max(8).refine((tags) => tags.every(isIndustryTag))`, `logoMediaId` uuid nullable, `website` https URL nullable; when `logoMediaId` is set, verify `SELECT id FROM media WHERE id = $logo AND registered_by_profile_id = $profile AND archived_at IS NULL` else throw `COMPANY_LOGO_INVALID`; then `UPDATE companies SET slug=…, tagline_en=…, tagline_zh_hk=…, description_zh_hk=…, tags=…::text[], logo_media_id=…, website=…, public_profile_status = CASE WHEN public_profile_status = 'published' THEN 'pending_review' ELSE public_profile_status END, profile_reviewed_at = NULL, profile_reviewed_by_profile_id = NULL, profile_rejection_reason = NULL, updated_at = now() WHERE id = $company RETURNING *`; catch a Postgres `23505` whose `constraint` is `companies_slug_unique` and rethrow `new Error("COMPANY_SLUG_TAKEN")`.
  - `submitForReview(actor, companyId)` — manager role; `UPDATE companies SET public_profile_status = 'pending_review', updated_at = now() WHERE id = $c AND public_profile_status IN ('hidden','rejected') AND slug IS NOT NULL RETURNING *`; no row → `INVALID_PROFILE_TRANSITION`.
  - `listForReview(actor)` — `requireAdmin`; `SELECT c.*, md.url AS logo_url FROM companies c LEFT JOIN media md ON md.id = c.logo_media_id WHERE c.public_profile_status = 'pending_review' ORDER BY c.updated_at ASC`.
  - `review(actor, companyId, decision)` — `requireAdmin`; `decision` is the same discriminated union as B1 (`approve` | `reject` + reason); transaction: `SELECT … FOR UPDATE`, require `pending_review` else `INVALID_PROFILE_TRANSITION`, `UPDATE` to `published` (with `public_profile_published_at = coalesce(public_profile_published_at, now())`) or `rejected` (+ reason), reviewer columns, `RETURNING *`; then `INSERT INTO audit_events (actor_user_id, actor_type, action, target_type, target_id, metadata) VALUES ($profile, $kind, 'company.profile.approved' | 'company.profile.rejected', 'company', $id, jsonb)`.

Export `companyProfilesRepository = createCompanyProfilesRepository()` and add `export {companyProfilesRepository} from "./company-profiles";` to `lib/db/repos/index.ts`.

- [ ] **Step 5: Run** `npx vitest run tests/unit/industry-tags.test.ts tests/unit/company-profiles-repository.test.ts tests/unit/repository-production-security.test.ts --reporter=dot && npm run typecheck && npx eslint config/industry-tags.ts lib/db/repos/company-profiles.ts` → PASS.

- [ ] **Step 6: Commit** — `git add config/industry-tags.ts lib/db/repos/company-profiles.ts lib/db/repos/index.ts tests/unit/industry-tags.test.ts tests/unit/company-profiles-repository.test.ts && git commit -m "feat(db): company public-profile repository with review loop and industry tag vocabulary (B-6, B-7)"`.

---

### Task 3: Portal company profile editing and "publish my profile" (B-7)

**Files:** `lib/portal/company-profile-core.ts` (C), `lib/portal/company-profile-actions.ts` (C, `"use server"`), `components/portal/company-profile-form.tsx` (C), `app/[locale]/(member)/portal/company/page.tsx` (M), `lib/portal/queries.ts` (M: `DashboardCompany` gains `slug`, `tags`, `taglineEn`, `taglineZhHk`, `descriptionZhHk`, `logoMediaId`, `publicProfileStatus`, `profileRejectionReason`), `messages/*` (`Portal.companyProfile`). Test: `tests/unit/company-profile-core.test.ts`.

- [ ] **Step 1: Failing test** — mirror `tests/unit/member-event-core.test.ts` (B1 Task 3): `saveCompanyProfile(actor, input, deps)` resolves the first `canManage` company from `deps.dashboard(actor)` and calls `deps.profiles.updateProfile(actor, companyId, input)`; `submitCompanyProfile(actor, deps)` calls `deps.profiles.submitForReview(actor, companyId)`; no managed company → rejects `NO_MANAGED_COMPANY`.

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Core and actions** — `lib/portal/company-profile-core.ts` is `lib/events/member-core.ts` with `profiles: Pick<typeof companyProfilesRepository, "updateProfile" | "submitForReview">` in place of `events` and the two functions above. `lib/portal/company-profile-actions.ts` (`"use server"`): `saveCompanyProfileAction(locale, _state, formData)` and `submitCompanyProfileAction(locale, _state, formData)`, each resolving `requireActor` via dynamic import, mapping the form (`slug`, `taglineEn`, `taglineZhHk`, `descriptionZhHk`, `website`, `logoMediaId` via the B1 `optional` helper pattern; `tags: formData.getAll("tags").map(String)`), returning `{status: "saved" | "submitted" | "error", code?}` and calling `revalidatePath(\`/${locale}/portal/company\`)`, `revalidatePath("/en/members")`, `revalidatePath("/zh-HK/members")`. Errors surface as codes: `INVALID`, `FORBIDDEN`, `NO_MANAGED_COMPANY`, `INVALID_PROFILE_TRANSITION`, `COMPANY_SLUG_TAKEN`, `COMPANY_LOGO_INVALID`.

- [ ] **Step 4: Form and page** — `components/portal/company-profile-form.tsx` (`"use client"`, `useActionState` for both actions like B1's `EventForm`): the six text fields, a tag checkbox grid from `INDUSTRY_TAGS` labelled with `industryTagLabel(slug, locale)`, the `HeroUpload` widget from B1 Task 4 (labels from `Portal.companyProfile.logo.*`) writing into the controlled `logoMediaId` input, a status line, the rejection banner, and two buttons: `save` (`formAction`) and `publish` (disabled when the slug is empty or `readOnly`). Add it to `portal/company/page.tsx` beneath the existing company form, passing `company.canManage` as `readOnly={!company.canManage}` and the new dashboard fields as defaults; extend `getDashboard`'s company projection in `lib/portal/queries.ts` and its fixtures in `tests/unit/portal-*.test.ts` with the new keys.

Strings `Portal.companyProfile` — en: `{"title": "Public member page", "description": "Choose what appears on your organisation's page in the WTIA member directory. Pages go live after a short WTIA review.", "fields": {"slug": "Page address (hkwtia.org/members/…)", "taglineEn": "Tagline (English)", "taglineZhHk": "Tagline (Chinese)", "descriptionZhHk": "Description (Chinese)", "website": "Website", "tags": "Industry tags (up to 8)", "logoMediaId": "Logo image id"}, "logo": {"choose": "Choose a logo (PNG, JPEG or WebP, up to 4 MB)", "upload": "Upload", "uploading": "Uploading…", "done": "Uploaded — the id has been filled in above.", "failed": "Upload failed. Check the file type and size.", "alt": "Describe the logo"}, "save": "Save", "publish": "Publish my profile", "saved": "Saved.", "submitted": "Submitted for review.", "status": {"hidden": "Not published", "pending_review": "Awaiting WTIA review", "published": "Live on /members", "rejected": "Returned by WTIA"}, "rejectedWith": "Returned by WTIA: {reason}", "viewPublic": "View public page", "errors": {"INVALID": "Check the page address, tags and links.", "FORBIDDEN": "Only company owners and admins can edit this.", "NO_MANAGED_COMPANY": "You do not manage a company yet.", "INVALID_PROFILE_TRANSITION": "Add a page address, then publish.", "COMPANY_SLUG_TAKEN": "That page address is already used.", "COMPANY_LOGO_INVALID": "That image id is not one you uploaded."}}`; zh-HK: `{"title": "公開會員專頁", "description": "選擇貴機構在 WTIA 會員名錄專頁上顯示的內容。專頁經 WTIA 簡短審核後上線。", "fields": {"slug": "專頁網址（hkwtia.org/members/…）", "taglineEn": "標語（英文）", "taglineZhHk": "標語（中文）", "descriptionZhHk": "簡介（中文）", "website": "網站", "tags": "行業標籤（最多 8 個）", "logoMediaId": "商標圖片編號"}, "logo": {"choose": "選擇商標（PNG、JPEG 或 WebP，最大 4 MB）", "upload": "上載", "uploading": "上載中…", "done": "已上載 — 編號已填入上方。", "failed": "上載失敗。請檢查檔案類型及大小。", "alt": "描述此商標"}, "save": "儲存", "publish": "發布我的專頁", "saved": "已儲存。", "submitted": "已提交審核。", "status": {"hidden": "未發布", "pending_review": "等待 WTIA 審核", "published": "已於 /members 上線", "rejected": "WTIA 已退回"}, "rejectedWith": "WTIA 已退回：{reason}", "viewPublic": "查看公開專頁", "errors": {"INVALID": "請檢查專頁網址、標籤及連結。", "FORBIDDEN": "只有公司擁有人及管理員可編輯。", "NO_MANAGED_COMPANY": "你尚未管理任何公司。", "INVALID_PROFILE_TRANSITION": "請先填寫專頁網址，然後發布。", "COMPANY_SLUG_TAKEN": "此專頁網址已被使用。", "COMPANY_LOGO_INVALID": "此圖片編號並非你上載的圖片。"}}`.

- [ ] **Step 5: Run** `npx vitest run tests/unit/company-profile-core.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/locale-href-boundary.test.ts tests/unit/portal-presentational.test.tsx tests/unit/portal-authorization.test.ts tests/unit/portal-nav.test.tsx --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/portal components/portal "app/[locale]/(member)/portal/company"` → PASS. **Commit** `feat(portal): members edit and submit their public company profile (B-7)`.

---

### Task 4: Staff profile review at `/admin/profiles-review` (B-7, D-8)

**Files:** `lib/admin/profile-review-core.ts` (C), `lib/admin/profile-review-actions.ts` (C), `components/admin/profile-review-table.tsx` (C), `app/[locale]/(admin)/admin/profiles-review/page.tsx` (C), `config/internal-navigation.ts` (operations group, after `listings`: `{id: "profiles-review", href: "/admin/profiles-review"}`), `components/admin/admin-nav.tsx` (`"profiles-review": "navigation.profilesReview"`), `config/wisetech-protected-route-inventory.ts` (`owner({id: "admin-profiles-review", family: "admin", classification: "admin-page", routePath: "/admin/profiles-review", filePath: "app/[locale]/(admin)/admin/profiles-review/page.tsx", dataOwner: "Staff review of public member pages (Phase B2)."})`), `app/[locale]/(admin)/admin/page.tsx` (sixth tile `{id: "profiles-review", href: "/admin/profiles-review", label: t("dashboard.profilesAwaitingReview"), count}`), `messages/*`. Tests: `tests/unit/profile-review-core.test.ts` (mirror B1's `event-review-core.test.ts` with `approveCompanyProfile`/`rejectCompanyProfile`), re-pin `internal-navigation-config` (`toHaveLength(19)`, operations ids), `admin-nav` (19 links, add `/admin/profiles-review`), `wisetech-protected-route-ownership` (+1 route, +1 `admin-page`, +1 `admin` family).

Shape copies B1 Task 5: core (`requireAdmin`, uuid, delegate to `companyProfilesRepository.review`), actions (`approveCompanyProfileAction(path, formData)`, `rejectCompanyProfileAction(path, formData)` with `revalidateAdminPath(path)` and `revalidatePath("/en/members")`/`"/zh-HK/members"`), table (per row: display name, slug, tags, website, taglines in a `<details>` preview since the public page is hidden until approval, logo via `<Image unoptimized={isPrivateMediaDeliveryUrl(url)}>`, approve form, reject form with required reason), page with `requireAdminPageActor()` first, namespace `Admin.profilesReview`, `.catch` → error alert.

Strings — en `Admin.navigation.profilesReview: "Member pages"`, `Admin.dashboard.profilesAwaitingReview: "Member pages awaiting review"`, `Admin.profilesReview: {"eyebrow": "Directory operations", "title": "Review member pages", "description": "Check each organisation's public page before it appears on /members.", "caption": "Member pages awaiting review", "company": "Company", "slug": "Address", "tags": "Tags", "preview": "Preview", "approve": "Publish", "reject": "Return", "rejectionReason": "Reason for returning", "empty": "No member pages are waiting for review.", "error": "Member pages could not be loaded."}`; zh-HK `"profilesReview": "會員專頁"`, `"profilesAwaitingReview": "等待審核的會員專頁"`, `{"eyebrow": "名錄營運", "title": "審核會員專頁", "description": "在機構專頁出現於 /members 前先行檢查。", "caption": "等待審核的會員專頁", "company": "公司", "slug": "網址", "tags": "標籤", "preview": "預覽", "approve": "發布", "reject": "退回", "rejectionReason": "退回原因", "empty": "目前沒有等待審核的會員專頁。", "error": "無法載入會員專頁。"}`.

- [ ] Run `npx vitest run tests/unit/profile-review-core.test.ts tests/unit/admin-page-auth-source.test.ts tests/unit/server-action-actor-boundary.test.ts tests/unit/admin-nav.test.tsx tests/unit/internal-navigation-config.test.ts tests/unit/wisetech-protected-route-ownership.test.ts --reporter=dot && npm run audit:strings && npm run typecheck && npx eslint lib/admin components/admin "app/[locale]/(admin)/admin"` → PASS. **Commit** `feat(admin): review queue publishes or returns member public pages (B-7, D-8)`.

---

### Task 5: `/members` becomes a real route (D-11)

**Files:** `config/public-routes.ts` (add `'/members'` after `'/ai-transparency'`), `next.config.ts` (delete the two `/members` explicit redirects at :158-159), `config/wisetech-integration-manifest.ts` (:196 `route-design-members`, :197 `route-legacy-member-detail`, :223 `route-design-member-detail` → `disposition: "retain"`, `canonicalPath` `/members` and `/members/[slug]`), `config/wisetech-authoritative-source-inventory.ts` (:43, :77, :99-105, :148 re-pointed to `/members` with `disposition: "retain"`), `tests/unit/redirects.test.ts` (:57, :63, :66-68 drop the two `/members` pins from the pre-existing set), `tests/unit/wisetech-route-parity.test.ts` (:213-216 and :436 recount after the manifest edit — run it once, read the new numbers from the failure, and pin those), `drizzle/0030_phase_b_members_route.sql` (generated by `npx drizzle-kit generate --config=drizzle.config.ts --name phase_b_members_route`; it recreates `site_announcements_href_check` with `/members` because the check is derived from `publicRoutes`).

- [ ] Run `npx vitest run tests/unit/redirects.test.ts tests/unit/wisetech-route-parity.test.ts tests/unit/seo-routes.test.ts tests/unit/legacy-urls.test.ts tests/unit/wisetech-announcement-schema-contract.test.ts tests/unit/page-copy-scope.test.ts tests/unit/content-contract.test.ts tests/unit/navigation.test.ts tests/unit/revalidate-public-path.test.ts --reporter=dot && npm run typecheck` → PASS (`seo-routes` now expects `/members` in the sitemap automatically; Task 6 adds the pages, so until then `/members` 404s at runtime — land Tasks 5 and 6 in the same PR). **Commit** `feat(routes): /members and /members/[slug] are canonical; retire the temporary showcase redirects (D-11)`.

---

### Task 6: Public directory and member pages with JSON-LD (B-6, D-11)

**Files:**
- `lib/members/public.ts` (C): `parseMemberFilters(query): MemberFilters` — `q` trimmed ≤120 or null; `tag` via `isIndustryTag`; `plan` via `MEMBERSHIP_PLAN_CODES`; plus `memberFilterQuery(filters)` for links.
- `components/marketing/member-filters.tsx` (C): GET form like `showcase-filters.tsx` — `.directory-search` with `#q` and submit; `.directory-actions` with a `tag` `<select>` from `INDUSTRY_TAGS` (`industryTagLabel`), a `plan` `<select>` from `MEMBERSHIP_PLAN_CODES` (`Members.plans.*`), and a clear `<Link href="/members">`.
- `components/marketing/member-card.tsx` (C): `.partner-record-card` with logo (`next/image`, `unoptimized={isPrivateMediaDeliveryUrl(url)}`, fallback to a neutral mark), name, tagline by locale, up to 3 tag chips via `industryTagLabel`, plan badge `Members.plans.<plan>`, link `localizedPath(locale, \`/members/${slug}\`)` with `Members.view`.
- `app/[locale]/(public)/members/page.tsx` (C): `export const dynamic = "force-dynamic"`; `generateMetadata` via `buildPageMetadata({locale, pathname: "/members", title: t("metaTitle"), description: t("metaDescription")})`; `PageHero` (breadcrumb like `/showcase`), `Section` with `MemberFilters`, `role="status"` results count `t("resultsTitle", {count})`, `partner-record-grid` of `MemberCard`, `HonestEmpty variant="inner"` with a clear action; repository read `companyProfilesRepository.listPublished(filters).catch(() => [])`; `ClosingBand` with `Members.detail.joinCta`/`join` → `/membership`.
- `app/[locale]/(public)/members/[slug]/page.tsx` (C): body awaits `getPublishedBySlug(slug)` **bare** and calls `notFound()` only on a `null` row — the catch belongs in `generateMetadata` alone, which keeps its `.catch(() => null)` fallback to the branded `Members.metaTitle`/`metaDescription` pair. (Corrected from the `.catch(() => null)` this bullet first specified for the body: that collapses a transient outage into a miss, and on the page that receives the retired `/members/:id` 307s and emits the JSON-LD below, a false 404 tells a crawler to drop a reviewed member page where a 5xx only asks it to retry — `/showcase/[slug]` draws the same line, and `tests/unit/member-detail-page.test.tsx` pins it.) Metadata `brandedTitle(locale, profile.name)` + tagline/description; `PageHero variant="inner"` with breadcrumb `Members.breadcrumbCurrent`; body: logo, taglines, tag chips, website link (`rel="noopener noreferrer"`), description by locale, showcase block (link `/showcase/[slug]`) when present, upcoming events list (link `/events/[slug]`, Hong Kong date) or `Members.detail.noEvents`; `<StructuredData data={buildMemberOrganizationData(profile, locale)} />` and `<StructuredData data={buildBreadcrumbData([{name: tCommon("breadcrumbHome"), url: absoluteUrl(localizedPath(locale, "/"))}, {name: t("breadcrumbCurrent"), url: absoluteUrl(localizedPath(locale, "/members"))}, {name: profile.name, url: absoluteUrl(localizedPath(locale, \`/members/${profile.slug}\`))}])} />`.
- `lib/structured-data.ts` (M): `buildMemberOrganizationData(profile: {name, slug, website, logoUrl, description}, locale): WithContext<Organization>` → `{"@context": "https://schema.org", "@type": "Organization", name, url: absoluteUrl(localizedPath(locale, /members/slug)), ...(logoUrl ? {logo: absoluteUrl(logoUrl)} : {}), ...(website ? {sameAs: [website]} : {}), ...(description ? {description} : {}), memberOf: {"@type": "Organization", name: siteConfig.name, url: absoluteUrl("/")}}`; `buildBreadcrumbData(items: readonly {name: string; url: string}[]): WithContext<BreadcrumbList>` → `itemListElement: items.map((item, index) => ({"@type": "ListItem", position: index + 1, name: item.name, item: item.url}))`.
- `components/seo/structured-data.tsx` (M): add `BreadcrumbList` to the accepted union.
- `app/sitemap.ts` (M): sixth loader `companyProfilesRepository.listPublishedSlugs().catch(() => [])` → `memberEntries = slugs.flatMap((slug) => localizedEntries(\`/members/${slug}\`))`, returned after showcase.

Tests: `tests/unit/member-filters.test.ts` (parse + query round trip), `tests/unit/wt-pages/members-page.test.tsx` (mock `@/lib/db/repos/company-profiles`; index renders grid for two rows and the empty state for none; detail renders both JSON-LD `@type`s and 404s on null), extend `tests/unit/structured-data.test.ts` (Organization carries `memberOf` and `url`; BreadcrumbList has three positioned items), extend `tests/unit/sitemap.test.ts` (both locale URLs for a published member slug; static entries survive a failed member read).

Strings — new top-level `Members` namespace in both bundles (not added to `pageCopyNamespaces`, so `page-copy-scope` pins stay). en: `{"metaTitle": "Members | WiseTech Hong Kong", "metaDescription": "Hong Kong wireless and AI+ technology companies in the WTIA member directory.", "eyebrow": "Member directory", "title": "WTIA members", "description": "Organisations shaping Hong Kong's wireless, mobile and AI+ industry. Each page is maintained by the member and reviewed by WTIA.", "breadcrumbCurrent": "Members", "filters": {"search": "Search members", "tag": "Industry", "anyTag": "All industries", "plan": "Membership", "anyPlan": "All tiers", "submit": "Search", "clear": "Clear"}, "plans": {"community": "Community", "startup": "Startup", "corporate": "Corporate", "patron": "Patron"}, "resultsTitle": "{count} members", "emptyTitle": "No member pages match yet", "emptyDescription": "Member pages appear here once organisations publish them. Try a broader search.", "view": "View member page", "detail": {"website": "Website", "showcase": "Solution in the WTIA Showcase", "events": "Upcoming events by this member", "noEvents": "No upcoming events.", "joinCta": "Your organisation could be listed here", "join": "See membership plans"}}`; zh-HK: `{"metaTitle": "會員｜WiseTech Hong Kong", "metaDescription": "WTIA 會員名錄中的香港無線及 AI+ 科技企業。", "eyebrow": "會員名錄", "title": "WTIA 會員", "description": "塑造香港無線、流動及 AI+ 產業的機構。每個專頁由會員維護並經 WTIA 審核。", "breadcrumbCurrent": "會員", "filters": {"search": "搜尋會員", "tag": "行業", "anyTag": "所有行業", "plan": "會籍", "anyPlan": "所有級別", "submit": "搜尋", "clear": "清除"}, "plans": {"community": "社群", "startup": "初創", "corporate": "企業", "patron": "贊助人"}, "resultsTitle": "{count} 個會員", "emptyTitle": "暫時沒有相符的會員專頁", "emptyDescription": "機構發布專頁後會在此顯示。請嘗試更廣泛的搜尋。", "view": "查看會員專頁", "detail": {"website": "網站", "showcase": "WTIA 方案展示中的方案", "events": "此會員即將舉行的活動", "noEvents": "暫無即將舉行的活動。", "joinCta": "貴機構也可在此列出", "join": "查看會員計劃"}}`.

- [ ] Run the new tests plus `seo-routes`, `sitemap`, `structured-data`, `locale-href-boundary`, `public-shell`, `wisetech-shell-boundary`, audit, typecheck, eslint → PASS. **Commit** `feat(members): public directory and member pages with Organization and BreadcrumbList JSON-LD (B-6, D-11)`.

---

### Task 7: Acceptance spec and gate (B-8)

`tests/e2e/phase-b2-member-directory.spec.ts`, shaped like `tests/e2e/phase-a-funnel.spec.ts` (bundle reader, `[{locale:"en", prefix:""}, {locale:"zh-HK", prefix:"/zh"}]`, `missingM2LiveEnvironment` gate):
- both locales: `/members` renders the `Members.title` h1 and the filter form; submitting `tag=ai` round-trips into the URL and keeps the select value; the first member card (skip when none) opens a page whose `script[type="application/ld+json"]` contents include `"Organization"` and `"BreadcrumbList"`;
- gated on `M2_TEST_*`: the company-admin saves a slug and tagline on `/portal/company`, clicks `Portal.companyProfile.publish`, sees `Portal.companyProfile.submitted`; staff opens `/admin/profiles-review`, sees the company, approves; `/members/<slug>` then returns 200 with the company name as h1.

Full gate: `npm run audit:strings && npm test && npm run lint && npm run typecheck && NEXT_PUBLIC_SITE_URL=https://hkwtia.vercel.app npm run build`. **Commit** `test(e2e): Phase B2 member directory acceptance spec (B-8)`.

---

## Phase B2 exit checklist

- [ ] Migrations 0028–0030 applied to production before the deploy (0029 assigns slugs; 0030 widens the announcement href check to `/members`). Phase A recipe: `neonctl connection-string production --project-id fragrant-mountain-25240574 --org-id org-soft-sunset-25251479`, then `DATABASE_URL=… npm run db:migrate`.
- [ ] `vercel promote` after the migration; `/members` serves 200 (no 307) in both locales; one published `/members/<slug>` validates in Google's Rich Results test (spec §5 gate).
- [ ] Owner gate: a Startup member publishes their page → staff approves → the page lists their showcase listing and, once B1 has merged, their approved event with organiser attribution.
- [x] B1 follow-up in the same PR as B2 Task 6 if B1 merged first: replace the display-name organiser matching in B1 Task 9 with `eq(companies.slug, filters.organiser)` and link the event organiser block to `/members/[slug]`. Done: the public projection now selects `companies.slug`/`companies.public_profile_status` and hands the detail page a slug only where `publicMemberPageSlug` (`lib/members/public.ts`, the JS twin of `publishedScope`) says a published page exists. `organiserSlugFromDisplayName` stays, now only to normalise a *typed* `?organiser=` query.
