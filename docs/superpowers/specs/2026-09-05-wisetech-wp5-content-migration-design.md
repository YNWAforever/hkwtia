# WP-5 · Content & Asset Migration Through the CMS — Design

**Programme:** WiseTech Hong Kong design-fidelity programme (`docs/superpowers/plans/2026-09-01-wisetech-design-fidelity.md` §5, WP-5). WP-0 through WP-4 are merged to `main`. This spec covers WP-5 only.

**Goal (verbatim from the master plan):** the 79 partner records and the archive photography reach production **only** through the audited authorities with rights confirmation — never by copying files.

**Scope for this implementation pass, agreed with the user up front:** build the tooling — the import script, its guard, its tests, and the staff runbook — fully gated so it refuses to run without explicit authorization. This pass never executes the script against any database (disposable or production), never flips an asset's `retire → merge` disposition, and never uploads real donor photography. Those are owner-only actions per the master plan's own framing ("2 days **+ staff review time**").

---

## 1. Architecture

Four independent pieces, landing in one PR:

1. **`scripts/import-wisetech-partners.ts`** + **`scripts/lib/partner-import-guard.ts`** — a standalone script (never invoked from `npm run db:seed`) that reads the donor's partner data and logo files, and inserts unpublished, unconfirmed `partners`/`media` rows through the same transactional shape `lib/db/repos/partners.ts` would produce.
2. **`tests/unit/wisetech-partner-import.test.ts`** — RED tests against injected fake DB/R2/filesystem dependencies. No real network or database calls.
3. **`docs/integration/wisetech-partner-import-runbook.md`** — the staff process: confirm relationship window + logo rights per partner in `/admin/partners/[id]`, then publish. Publication is refused by the existing repo until both confirmations exist.
4. **A new `MarketingExtras` page-copy namespace** (`lib/i18n/page-copy-scope.ts` + route mapping + `messages/{en,zh-HK}.json` keys + `SiteFooter`'s tagline read) — makes exactly the marketing strings WP-5 names staff-editable, without widening the existing `Footer` exclusion.

Archive photography itself needs no new code: `/admin/media` (already built) is the existing, correct upload path once the owner records rights for one of the six donor `.webp` files. This spec documents that step in the runbook; it does not add a script for it.

---

## 2. The import script

### 2.1 Authorization guard (`scripts/lib/partner-import-guard.ts`)

This cannot reuse `assertIsolatedSeedEnvironment` (`scripts/lib/acceptance-guard.ts`) unchanged — that helper *hard-forbids* production. This script is explicitly meant to be runnable against production once rights are confirmed, so its authorization shape is different in kind, not just in flag names:

```ts
export type PartnerImportAuthorization = Readonly<{
  actorProfileId: string;
  actorKind: "staff" | "exco" | "superadmin";
}>;

export function assertPartnerImportAuthorized(
  environment: Readonly<Record<string, string | undefined>>,
  hasSentinel: () => Promise<boolean>,
): Promise<PartnerImportAuthorization>
```

Rules, each a distinct thrown `Error` code so the runbook and tests can name them precisely:

| Condition | Failure code |
|---|---|
| `WISETECH_PARTNER_IMPORT` is not exactly `"true"` | `PARTNER_IMPORT_NOT_AUTHORIZED` |
| `WISETECH_IMPORT_ACTOR_PROFILE_ID` is missing or not a UUID | `PARTNER_IMPORT_ACTOR_REQUIRED` |
| `WISETECH_IMPORT_ACTOR_KIND` is set but not one of `staff`/`exco`/`superadmin` | `PARTNER_IMPORT_ACTOR_KIND_INVALID` (unset defaults to `"staff"`) |
| Neither `hasSentinel()` resolves `true` **nor** `WISETECH_IMPORT_ALLOW_PRODUCTION` is exactly `"true"` | `PARTNER_IMPORT_PRODUCTION_NOT_CONFIRMED` |

`hasSentinel` reuses the existing `acceptance_sentinel` read the seed guard already relies on (an unreadable table is a distinct failure from "no sentinel," per that module's existing convention — this script's guard inherits that same distinction, treating an unreadable table as `PARTNER_IMPORT_SENTINEL_CHECK_FAILED` rather than silently falling through to "must be production").

### 2.2 Per-partner write (`scripts/import-wisetech-partners.ts`)

For each parsed donor record not already present by `(category, nameEn)`:

1. Generate the media row's `id` up front via `randomUUID()` (matching `normalizeImageUpload`'s own pattern for its `objectKey`).
2. Read the logo PNG from `WISETECH_DONOR_DIR`'s `public/partners/**`; validate through the existing `normalizeImageUpload` (`lib/media/image-upload.ts`) with `altEn: "<name> logo"`, `altZh: "<name> 標誌"`, `focalX`/`focalY` defaulted to `50`/`50` (a logo has no meaningful off-center focal point).
3. Upload via `createR2Storage().put({key: objectKey, bytes, contentType, sha256})` (`lib/media/r2-storage.ts`).
4. In one transaction: insert `media` (`url: `/api/media/${id}`` — the private-delivery path shape `lib/media/url.ts`'s `isPrivateMediaDeliveryUrl` expects — plus `storageKey`, `storageEtag`, `originalFilename`, `contentType`, `byteSize`, `width`, `height`, `focalX`, `focalY`, `checksumSha256`, `registeredByProfileId: actorProfileId`); insert `partners` (`nameEn`, `nameZhHk`, `category`, `websiteUrl`, `logoMediaId`, `displayOrder` = donor order, `featured: false`; `relationshipStartsOn`/`relationshipEndsOn`/`relationshipConfirmedAt`/`logoRightsConfirmedAt`/`publishedAt` all omitted, which the existing `partnerInputSchema` → `toWrite` shape already turns into `NULL`); insert the `audit_events` row (`actorUserId: actorProfileId`, `actorType: actorKind`, `action: "partner.created"`, `targetType: "partner"`, `targetId: <new partner id>`, `metadata: {category}`) — the same shape `createPartner` in `lib/db/repos/partners.ts` produces, replicated directly rather than called through that function (which requires an authenticated `Actor`/HTTP-request context inappropriate for an offline CLI script — matching how `scripts/seed-m5.ts` also writes directly rather than through the repo layer).
5. Print only a running count (`created`, `skipped-existing`, `skipped-error`); never a URL, name, or secret.

A per-record failure (bad PNG, oversized file, missing donor asset) logs the partner's `nameEn` and the failure reason, then continues to the next record — partial progress is fine since a re-run is idempotent. A failure parsing `partnerData.ts` itself (the top-level Zod schema) aborts before any writes.

### 2.3 Donor input schema

The donor's `partnerData.ts` module was not accessible for direct inspection in this session (tooling limitation, not a data decision — see Appendix). The script's input schema is therefore derived from the master plan's own description, not fabricated donor content:

```ts
const donorPartnerSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["supporting", "regional", "media"]),
  website: z.string().url().optional(),
  logoFile: z.string().min(1), // relative to public/partners/** in WISETECH_DONOR_DIR
});
export const donorPartnerFileSchema = z.array(donorPartnerSchema);
```

This maps 1:1 onto the target `partnerCategoryEnum` values `supporting`/`regional`/`media` (the schema's other two enum members, `programme`/`sponsor`, are not populated by this import — WP-5's own count is "58 supporting, 15 regional, 6 media", 79 total, matching exactly). If the real `WISETECH_DONOR_DIR/partnerData.ts` shape differs, the owner adjusts either the donor export or this schema before running the script — the RED tests pin the schema's *contract*, not a specific donor file's literal content, so this is a safe seam to adjust later without touching the transactional/guard logic.

### 2.4 Chinese partner names

Per the master plan: `nameZhHk` is the English name unless a Chinese name is supplied in a sidecar. Rather than fabricate 79 translations, an optional `WISETECH_PARTNER_ZH_NAMES_CSV` env var points at a two-column `name_en,name_zh_hk` CSV the owner can populate later; a partner with no matching row falls back to its English name for `nameZhHk`. The CSV's own format is validated (exactly two columns, no blank `name_en`) and a malformed CSV aborts the whole run before any writes — the same "abort before writing" discipline as an unparseable `partnerData.ts`.

---

## 3. `MarketingExtras` page-copy namespace

`lib/i18n/page-copy-scope.ts` allowlists whole namespaces only; there's no per-key mechanism today. `Home` (covering hero/pathways/impact — three of the four strings WP-5 names) is already allowlisted, so those need no change beyond confirming their leaf keys already exist and resolve correctly. `Footer` is deliberately excluded ("structural... risk without benefit") and stays that way — its nav columns, legal line, and newsletter labels remain non-editable.

The footer tagline is the one string WP-5 names that doesn't fit anywhere already-editable. Rather than widen `Footer` (rejected — would expose structural content the existing design deliberately protects) or build a new per-key scoping engine (rejected — real architecture change to a system every admin page-copy editor depends on, for a need that has only come up once), this spec adds one new, narrowly-scoped namespace:

```ts
// lib/i18n/page-copy-scope.ts
export const pageCopyNamespaces = [
  "Home", "About", "Chairman", "Committees", "Contact",
  "programs", "Membership", "Privacy", "AiTransparency",
  "MarketingExtras", // WP-5: footer tagline + any other copy that doesn't belong to a page namespace
] as const;

export const pageCopyRoutes: Readonly<Record<PageCopyNamespace, readonly PublicRoute[]>> = {
  // ...existing entries unchanged...
  MarketingExtras: ["/"], // the footer renders on every public route, but the tagline is visually anchored to Home
};
```

`messages/{en,zh-HK}.json` gain a new `MarketingExtras.footerTagline` key, seeded with the current `Footer.tagline` value. `components/layout/site-footer.tsx` reads `t("MarketingExtras.footerTagline")` in place of `t("Footer.tagline")` — a one-line change, since `SiteFooter` already resolves its own namespace translator per-call. `Footer.tagline` itself is removed from both bundles in the same commit (no orphaned, unread key) — `tests/unit/messages.test.ts`'s key-parity check and `npm run audit:strings` both catch a mismatch here if the swap is incomplete.

---

## 4. Testing

`tests/unit/wisetech-partner-import.test.ts`:
- Guard refuses with each of `WISETECH_PARTNER_IMPORT` unset, `WISETECH_IMPORT_ACTOR_PROFILE_ID` unset, and (with a non-sentinel DB) `WISETECH_IMPORT_ALLOW_PRODUCTION` unset — three distinct assertions, three distinct error codes.
- Guard accepts either the disposable-sentinel path or the explicit-production-override path (two separate passing cases, not one that happens to satisfy both).
- A second run against an identical fixture inserts 0 new rows (idempotent on `(category, nameEn)`).
- A created partner row has `publishedAt`, `relationshipConfirmedAt`, and `logoRightsConfirmedAt` all `null`.
- A created media row's `altEn`/`altZh` are both non-blank.
- Category mapping from the donor's three source categories to the DB enum is exact.
- The sidecar CSV: a partner with a matching row gets that `nameZhHk`; a partner with no matching row falls back to English; a malformed CSV aborts before any writes.

New `lib/i18n/page-copy-scope.ts` test coverage: `MarketingExtras` is a real `PageCopyNamespace`; its route mapping passes the existing "every entry is a real `publicRoutes` member" test; `Footer.tagline` is genuinely gone from both bundles (not just unread).

All against injected fake dependencies (matching the existing `PartnerMutationDependencies`-style injection already used by `lib/db/repos/partners.ts`) — no real network or database calls anywhere in this test file.

---

## 5. Out of scope for this pass (explicit)

- Running the script against any database, disposable or production.
- Supplying real Chinese partner names (the CSV mechanism exists; its content does not).
- Uploading any real donor `.webp` archive photography.
- Flipping any `config/wisetech-authoritative-source-inventory.ts` asset disposition from `retire` to `merge`.
- Confirming any partner's relationship window or logo rights.

These are the master plan's own "staff review time" and "owner-only actions" — this spec's job is to make them possible and safe, not to perform them.

---

## Appendix: donor `partnerData.ts` shape — unverified

This session could not reliably browse the donor commit's `app/` tree for the file's real location and shape (a tooling limitation in the sandbox this session ran in, not a deliberate omission). §2.3's schema is derived from the master plan's textual description (name, category ∈ {supporting, regional, media}, optional website, a logo file reference) and the exact record counts it states (58 + 15 + 6 = 79). Before running this script for real, the owner should diff this schema against the actual `WISETECH_DONOR_DIR/partnerData.ts` export and adjust either side if they've drifted.
