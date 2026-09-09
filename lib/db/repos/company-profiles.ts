import "server-only";

import {sql, type SQL} from "drizzle-orm";
import {z} from "zod";

import {isIndustryTag} from "@/config/industry-tags";
import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {mediaRepository} from "@/lib/db/repos/media";
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {auditEvents, companies, events, media, memberships, showcaseListings} from "@/lib/db/server-schema";
import {MEMBERSHIP_PLAN_CODES, type MembershipPlanCode} from "@/lib/membership/constants";
import {requireMember, type Actor, type CompanyRole} from "@/lib/membership/lifecycle";
import {canonicalHttpsUrl} from "@/lib/security/https-url";

/**
 * Programme B-6 / B-7 (D-11): the public member directory and its moderation
 * loop. Every statement goes through the same raw-SQL `AutomationDatabase` seam
 * the journeys and member-event repositories use, so a unit test can script the
 * rows each statement returns without a database.
 *
 * Two rules shape the file:
 *
 * 1. A public read takes **no actor** and scopes itself in SQL
 *    (`public_profile_status = 'published' AND slug IS NOT NULL`). An unpublished
 *    profile must never reach this process, so it can never leak through a
 *    forgotten JS filter, a partial render or an error path.
 * 2. Every member write goes through `requireCompanyManager`, and every staff
 *    write through `requireAdmin`, *inside* the repository — the page and the
 *    server action are not the gate (CLAUDE.md hard boundary 2).
 *
 * The helpers below (`executedRows`, `requireCompanyManager`, `textArray`,
 * `isSlugUniqueViolation`) are deliberate copies of the ones in
 * `lib/db/repos/events.ts` rather than shared imports: they are private to a
 * repository by design, and unifying them would export a database seam across
 * module boundaries. `events.ts` resolves its database through a
 * `memberDatabase(deps)` helper; the factory shape here closes over the loader
 * once instead, which is the only structural difference.
 */

export type MemberFilters = Readonly<{q: string | null; tag: string | null; plan: MembershipPlanCode | null}>;

export type PublicMemberSummary = Readonly<{
  id: string;
  slug: string;
  name: string;
  tagline: Readonly<{en: string | null; zhHk: string | null}>;
  tags: readonly string[];
  plan: MembershipPlanCode | null;
  website: string | null;
  logoUrl: string | null;
}>;

export type PublicMemberProfile = PublicMemberSummary & Readonly<{
  description: Readonly<{en: string | null; zhHk: string | null}>;
  industry: string | null;
  sizeBand: string | null;
  showcase: Readonly<{slug: string; name: string}> | null;
  events: readonly Readonly<{slug: string; titleEn: string; titleZh: string | null; startsAt: Date}>[];
}>;

export type CompanyProfileDependencies = Readonly<{
  loadDatabase?: AutomationDatabaseLoader;
  getCompanyRole?: (actor: Actor, companyId: string) => Promise<CompanyRole | null>;
  /** Defaults to `mediaRepository.getOwnedByProfile`: active media this member uploaded themselves. */
  getOwnedMedia?: (actor: Actor, mediaId: string) => Promise<Readonly<{id: string}> | null>;
}>;

const companyIdSchema = z.string().uuid();
// The one shape a directory slug may take, matching `companies_slug_unique`,
// the 0029 backfill's own guard and tests/fixtures/company-slug.ts.
const slugSchema = z.string().trim().min(2).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
/**
 * Rendered as an anchor on an anonymous public page, and as `sameAs` in that
 * page's Organization JSON-LD, so the string a member types is the string a
 * stranger reads — and the string the staff reviewer squints at in the queue.
 * A scheme test is not enough for that: `z.url()` alone admits `javascript:`
 * and `data:`, and even `^https://` still admits
 * `https://wtia.org.hk@evil.example`, an explicit port, `localhost`, an IP
 * literal and bidi overrides — every one of them a way to make a hostile host
 * read as ours. So delegate to `canonicalHttpsUrl`, which owns that policy for
 * the whole repo (`lib/db/repos/partners.ts` uses it too), instead of keeping a
 * second, looser copy of it here.
 *
 * Two of its clauses are dropped deliberately, and only these two:
 *  - `allowQuery` — a member's own site legitimately carries a language variant
 *    or a landing-page parameter, which the partner rule rejects outright.
 *  - the untrimmed-input clause — this is a form field, so `.trim()` normalises
 *    the whitespace rather than failing the member for it.
 * `lib/db/repos/events.ts`'s http-or-https `httpUrlSchema` guards an
 * organiser's meeting or registration link, a different question; an
 * organisation website on an anonymous page is https only.
 */
const httpsUrlSchema = z.string().trim().transform((value, context) => {
  try {
    return canonicalHttpsUrl(value, {allowQuery: true});
  } catch {
    context.addIssue({code: z.ZodIssueCode.custom, message: "COMPANY_WEBSITE_INVALID"});
    return z.NEVER;
  }
});

/** Empty text is a cleared field, not a blank tagline; the public page tests for null. */
function optionalText(max: number) {
  return z.string().trim().max(max).nullable().optional()
    .transform((value) => (value === undefined || value === null || value.length === 0 ? null : value));
}

const profileInputSchema = z.object({
  slug: slugSchema,
  taglineEn: optionalText(160),
  taglineZhHk: optionalText(160),
  descriptionZhHk: optionalText(2_000),
  // S-4: the controlled vocabulary only. Free text would be unreachable from
  // the directory's `tags @> ARRAY[...]` predicate and unlabelable in zh-HK.
  tags: z.array(z.string()).max(8).default([])
    .refine((tags) => tags.every(isIndustryTag), {message: "COMPANY_TAG_UNKNOWN"}),
  logoMediaId: z.string().uuid().nullable().optional().default(null),
  website: httpsUrlSchema.nullable().optional().default(null),
}).strict();

export type CompanyProfileInput = z.input<typeof profileInputSchema>;

const reviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({decision: z.literal("approve")}).strict(),
  z.object({decision: z.literal("reject"), reason: z.string().trim().min(1).max(1_000)}).strict(),
]);

export type CompanyProfileReviewDecision = z.input<typeof reviewDecisionSchema>;

/**
 * `updateProfile` is not the only writer of `companies.website`:
 * `companyUpdateSchema` in `lib/portal/command-core.ts` and the join form's
 * `companySchema` both accept `z.string().trim().max(500)` with no scheme
 * check, and a company can reach `pending_review` or `published` without ever
 * passing through this repository — the 0029 backfill gives it a slug,
 * `submitForReview` only asks for one, and `review` only asks for the status.
 * So a legacy `javascript:`, `data:` or scheme-less value could otherwise reach
 * a reader. Sanitise on the read instead of trusting the column, exactly as
 * `publicWebsiteUrl` in `lib/db/repos/partners.ts` does.
 *
 * Every read that puts the column in front of somebody runs this: the
 * directory, the member page, and the staff review queue below — the queue is a
 * preview of that page, so it must not be the one leg that skips the policy,
 * and its reviewer is the reader a `https://wtia.org.hk@evil.example` host is
 * aimed at. `CompanyProfileRow.website` — the raw column a write hands back
 * through `RETURNING *` — is the only place the string stays verbatim, and
 * nothing renders that.
 *
 * It runs `httpsUrlSchema`'s rule exactly — the same `canonicalHttpsUrl` with
 * the same two relaxations (`allowQuery`, and a trim instead of a rejection) —
 * so a reader sees what a member is allowed to store and nothing else. That
 * means every host clause holds here as well as the scheme: no userinfo (that
 * host reads as ours until the parser reaches the '@'), no explicit port, no
 * `localhost` or IP-literal host, no bidi or control characters, at most 2048
 * code points. A value that fails any of them degrades to no link rather than
 * to a link the reader cannot judge.
 */
function publicWebsiteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return canonicalHttpsUrl(value.trim(), {allowQuery: true});
  } catch {
    return null;
  }
}

/**
 * The snake_case shape `RETURNING *` / `SELECT *` hands back through the
 * raw-SQL seam. Only the two fields every caller branches on are required: a
 * write returns whatever columns the row has, and pinning the rest would make
 * this schema a second, drifting copy of `schema-core.ts`. The review queue
 * parses a stricter shape below, where a missing `display_name` really is a bug
 * and `website` is the policed href rather than the stored string.
 */
const companyProfileRowSchema = z.object({
  id: z.string().uuid(),
  public_profile_status: z.enum(["hidden", "pending_review", "published", "rejected"]),
  slug: z.string().nullable().optional(),
  display_name: z.string().optional(),
  tagline_en: z.string().nullable().optional(),
  tagline_zh_hk: z.string().nullable().optional(),
  description_zh_hk: z.string().nullable().optional(),
  // The three `companies` columns the member directory renders that the profile
  // form does not own. `PUBLICLY_RENDERED_COLUMNS` in `lib/db/repos/companies.ts`
  // sends a published profile back to `pending_review` when `/portal/company`
  // rewrites any of them, and `detailColumns` below puts all three on
  // `/members/[slug]`, so the queue that gates that page has to be able to show
  // them. `.passthrough()` already carried the values through `SELECT companies.*`;
  // typing them here is what lets the queue page map them onto its preview
  // instead of reading `unknown`.
  description: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  size_band: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  website: z.string().nullable().optional(),
  logo_media_id: z.string().nullable().optional(),
  public_profile_published_at: z.coerce.date().nullable().optional(),
  profile_reviewed_at: z.coerce.date().nullable().optional(),
  profile_reviewed_by_profile_id: z.string().nullable().optional(),
  profile_rejection_reason: z.string().nullable().optional(),
  updated_at: z.coerce.date().optional(),
}).passthrough();

export type CompanyProfileRow = z.infer<typeof companyProfileRowSchema>;

/**
 * What the staff queue hands its page. `website` is sanitised in the schema
 * rather than at the call site so the contract, not a reviewer of this file,
 * carries the guarantee: a queue row's `website` is a href the page may put in
 * an anchor, and a stored value that fails the policy shows as no link there —
 * which is exactly what `/members` will show once it is approved.
 */
const reviewQueueRowSchema = companyProfileRowSchema.extend({
  display_name: z.string(),
  logo_url: z.string().nullable(),
  website: z.string().nullable().optional().transform((value) => publicWebsiteUrl(value ?? null)),
});

export type CompanyProfileReviewRow = z.infer<typeof reviewQueueRowSchema>;

const summaryRowSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  display_name: z.string(),
  tagline_en: z.string().nullable(),
  tagline_zh_hk: z.string().nullable(),
  tags: z.array(z.string()),
  website: z.string().nullable(),
  plan_code: z.enum(MEMBERSHIP_PLAN_CODES).nullable(),
  logo_url: z.string().nullable(),
});

const detailRowSchema = summaryRowSchema.extend({
  description: z.string().nullable(),
  description_zh_hk: z.string().nullable(),
  industry: z.string().nullable(),
  size_band: z.string().nullable(),
});

const slugValueSchema = z.string();
const showcaseRowSchema = z.object({slug: z.string(), name_en: z.string()});
const eventRowSchema = z.object({
  slug: z.string(),
  title_en: z.string(),
  title_zh: z.string().nullable(),
  starts_at: z.coerce.date(),
});

/** Neon returns `{rows}`; the in-memory executor in tests returns the array itself. */
function executedRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as Record<string, unknown>[];
  return [];
}

function companyProfileRows(result: unknown): CompanyProfileRow[] {
  return executedRows(result).map((row) => companyProfileRowSchema.parse(row));
}

function textArray(values: readonly string[]) {
  // drizzle expands a JS array inside `sql` into a `(a, b)` list, which is not a
  // Postgres array and is a syntax error when empty; build ARRAY[] instead.
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

// Drizzle wraps driver errors, so the Postgres code may sit on `cause`.
// `companies_slug_unique` is the only unique index an UPDATE here can violate,
// which is why an unnamed 23505 counts as one.
function isSlugUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {code?: unknown; constraint?: unknown; cause?: unknown};
  if (candidate.code === "23505" && (candidate.constraint === undefined || candidate.constraint === "companies_slug_unique")) return true;
  return isSlugUniqueViolation(candidate.cause);
}

const MAX_QUERY_LENGTH = 120;

/** `null` for anything that cannot be a search: the directory then renders unfiltered on that axis, as /events does. */
function searchPattern(value: string | null): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0 || trimmed.length > MAX_QUERY_LENGTH) return null;
  // A typed `%` or `_` searches for that character, not for every row.
  return `%${trimmed.replace(/([\\%_])/g, "\\$1")}%`;
}

/**
 * The public scope, as a predicate rather than a filter applied to rows. An
 * unpublished company and a published one without a slug (which would have no
 * addressable page) are both invisible to every read below.
 */
const publishedScope = sql`${companies.publicProfileStatus} = 'published' AND ${companies.slug} IS NOT NULL`;

const directoryColumns = sql`
  ${companies.id} AS id, ${companies.slug} AS slug, ${companies.displayName} AS display_name,
  ${companies.taglineEn} AS tagline_en, ${companies.taglineZhHk} AS tagline_zh_hk,
  ${companies.tags} AS tags, ${companies.website} AS website,
  active_plan.plan_code AS plan_code, ${media.url} AS logo_url
`;

const detailColumns = sql`
  ${directoryColumns}, ${companies.description} AS description, ${companies.descriptionZhHk} AS description_zh_hk,
  ${companies.industry} AS industry, ${companies.sizeBand} AS size_band
`;

/**
 * The plan badge is the company's current membership, newest first: a lapsed
 * one must not decide the directory's order. A LATERAL keeps that to one row
 * per company instead of multiplying the result set.
 */
const directoryFrom = sql`
  FROM ${companies}
  LEFT JOIN LATERAL (
    SELECT ${memberships.planCode} AS plan_code
    FROM ${memberships}
    WHERE ${memberships.companyId} = ${companies.id}
      AND ${memberships.status} IN ('active', 'past_due', 'cancel_at_period_end')
    ORDER BY ${memberships.createdAt} DESC
    LIMIT 1
  ) active_plan ON true
  LEFT JOIN ${media} ON ${media.id} = ${companies.logoMediaId} AND ${media.archivedAt} IS NULL
`;

// D-5 "featured": patron and corporate lead the directory, then alphabetical.
const directoryOrder = sql`ORDER BY CASE active_plan.plan_code WHEN 'patron' THEN 0 WHEN 'corporate' THEN 1 ELSE 2 END, ${companies.displayName} ASC`;

/** Every filter is validated here, before it can reach SQL; an unusable one is dropped rather than passed through. */
function directoryFilters(filters: MemberFilters): SQL {
  const predicates: SQL[] = [];
  const pattern = searchPattern(filters.q);
  if (pattern !== null) {
    predicates.push(sql`(${companies.displayName} ILIKE ${pattern} OR coalesce(${companies.taglineEn}, '') ILIKE ${pattern} OR coalesce(${companies.taglineZhHk}, '') ILIKE ${pattern})`);
  }
  if (filters.tag !== null && isIndustryTag(filters.tag)) {
    predicates.push(sql`${companies.tags} @> ARRAY[${filters.tag}]::text[]`);
  }
  if (filters.plan !== null && (MEMBERSHIP_PLAN_CODES as readonly string[]).includes(filters.plan)) {
    predicates.push(sql`active_plan.plan_code = ${filters.plan}`);
  }
  return predicates.length === 0 ? sql`` : sql` AND ${sql.join(predicates, sql` AND `)}`;
}

function summaryFrom(row: z.infer<typeof summaryRowSchema>): PublicMemberSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.display_name,
    tagline: {en: row.tagline_en, zhHk: row.tagline_zh_hk},
    tags: row.tags,
    plan: row.plan_code,
    website: publicWebsiteUrl(row.website),
    logoUrl: row.logo_url,
  };
}

export function createCompanyProfilesRepository(dependencies: CompanyProfileDependencies = {}) {
  const loadDatabase: AutomationDatabaseLoader = dependencies.loadDatabase
    ?? (async () => await getDb() as unknown as AutomationDatabase);
  const getCompanyRole = dependencies.getCompanyRole ?? portalContentRepository.getCompanyRole;
  const getOwnedMedia = dependencies.getOwnedMedia
    ?? ((actor: Actor, mediaId: string) => mediaRepository.getOwnedByProfile(actor, mediaId));

  // Duplicates `requireCompanyManager` in `lib/db/repos/events.ts` and
  // `lib/db/repos/cohorts.ts`; see the file header on why these stay local.
  async function requireCompanyManager(actor: Actor, companyId: string): Promise<Extract<Actor, {kind: "member"}>> {
    requireMember(actor);
    const role = await getCompanyRole(actor, companyId);
    if (role !== "owner" && role !== "admin") throw new Error("FORBIDDEN");
    return actor;
  }

  return {
    /** Anonymous. The directory: every published profile, filtered and ordered in SQL. */
    async listPublished(filters: MemberFilters): Promise<PublicMemberSummary[]> {
      const database = await loadDatabase();
      const rows = executedRows(await database.execute(sql`
        SELECT ${directoryColumns}
        ${directoryFrom}
        WHERE ${publishedScope}${directoryFilters(filters)}
        ${directoryOrder}
      `));
      return rows.map((row) => summaryFrom(summaryRowSchema.parse(row)));
    },

    /** Anonymous. `null` for an unknown, unpublished or malformed slug — the page 404s without learning which. */
    async getPublishedBySlug(slugInput: string): Promise<PublicMemberProfile | null> {
      const slug = slugSchema.safeParse(slugInput);
      if (!slug.success) return null;
      const database = await loadDatabase();
      const row = executedRows(await database.execute(sql`
        SELECT ${detailColumns}
        ${directoryFrom}
        WHERE ${publishedScope} AND ${companies.slug} = ${slug.data}
        LIMIT 1
      `))[0];
      if (!row) return null;
      const profile = detailRowSchema.parse(row);
      // `showcase_listings_company_unique` makes this at most one row.
      const showcaseRow = executedRows(await database.execute(sql`
        SELECT ${showcaseListings.slug} AS slug, ${showcaseListings.nameEn} AS name_en
        FROM ${showcaseListings}
        WHERE ${showcaseListings.companyId} = ${profile.id} AND ${showcaseListings.status} = 'published'
        LIMIT 1
      `))[0];
      const listing = showcaseRow === undefined ? null : showcaseRowSchema.parse(showcaseRow);
      // Phase B1's `events.organiser_company_id`: what this member is running
      // next. Members-only and invite-only events stay off a public page.
      const upcoming = executedRows(await database.execute(sql`
        SELECT ${events.slug} AS slug, ${events.titleEn} AS title_en, ${events.titleZh} AS title_zh, ${events.startsAt} AS starts_at
        FROM ${events}
        WHERE ${events.organiserCompanyId} = ${profile.id}
          AND ${events.status} = 'published' AND ${events.visibility} = 'public'
          AND coalesce(${events.endsAt}, ${events.startsAt}) >= now()
        ORDER BY ${events.startsAt} ASC
        LIMIT 6
      `));
      return {
        ...summaryFrom(profile),
        description: {en: profile.description, zhHk: profile.description_zh_hk},
        industry: profile.industry,
        sizeBand: profile.size_band,
        showcase: listing === null ? null : {slug: listing.slug, name: listing.name_en},
        events: upcoming.map((event) => {
          const parsed = eventRowSchema.parse(event);
          return {slug: parsed.slug, titleEn: parsed.title_en, titleZh: parsed.title_zh, startsAt: parsed.starts_at};
        }),
      };
    },

    /** Anonymous. The sitemap's list of addressable member pages. */
    async listPublishedSlugs(): Promise<string[]> {
      const database = await loadDatabase();
      return executedRows(await database.execute(sql`
        SELECT ${companies.slug} AS slug
        FROM ${companies}
        WHERE ${publishedScope}
        ORDER BY ${companies.slug} ASC
      `)).map((row) => slugValueSchema.parse(row.slug));
    },

    /**
     * Owner/admin of the company. Editing a published profile sends it back to
     * `pending_review` and clears the reviewer columns, so approved copy is
     * never silently replaced by unreviewed copy on a live page.
     *
     * That guarantee needs the other writer to keep it too, and this method is
     * not it: `/portal/company` posts `updateCompanyAction` →
     * `lib/portal/command-core.ts`'s `updateCompany` → `companiesRepository.update`,
     * which writes `display_name`, `website`, `industry`, `size_band` and
     * `description` — every one of them projected onto /members by
     * `directoryColumns` and `detailColumns` above. `reviewResetFor` in
     * `lib/db/repos/companies.ts` applies the same demotion and the same
     * reviewer reset there. Those two are the only writers of public copy; a
     * third that skips the rule would make the queue advisory rather than a
     * gate, because `listForReview` only ever sees `pending_review`.
     */
    async updateProfile(actor: Actor, companyId: string, input: unknown): Promise<CompanyProfileRow> {
      const id = companyIdSchema.parse(companyId);
      const manager = await requireCompanyManager(actor, id);
      const parsed = profileInputSchema.parse(input);
      if (parsed.logoMediaId !== null) {
        // Same rule as a member event hero: a member may only attach media they
        // uploaded themselves, so a guessed or staff-registered id fails here
        // and reveals nothing about the row.
        const owned = await getOwnedMedia(manager, parsed.logoMediaId);
        if (!owned) throw new Error("COMPANY_LOGO_INVALID");
      }
      const database = await loadDatabase();
      let result: unknown;
      try {
        result = await database.execute(sql`
          UPDATE ${companies} SET
            slug = ${parsed.slug},
            tagline_en = ${parsed.taglineEn},
            tagline_zh_hk = ${parsed.taglineZhHk},
            description_zh_hk = ${parsed.descriptionZhHk},
            tags = ${textArray(parsed.tags)},
            logo_media_id = ${parsed.logoMediaId},
            website = ${parsed.website},
            public_profile_status = CASE WHEN ${companies.publicProfileStatus} = 'published'
              THEN 'pending_review'::public_profile_status ELSE ${companies.publicProfileStatus} END,
            profile_reviewed_at = NULL, profile_reviewed_by_profile_id = NULL, profile_rejection_reason = NULL,
            updated_at = now()
          WHERE ${companies.id} = ${id}
          RETURNING *
        `);
      } catch (error) {
        if (isSlugUniqueViolation(error)) throw new Error("COMPANY_SLUG_TAKEN");
        throw error;
      }
      const row = companyProfileRows(result)[0];
      if (!row) throw new Error("COMPANY_NOT_FOUND");
      return row;
    },

    /**
     * Owner/admin of the company. `hidden` and `rejected` are the only states a
     * member may submit from, and only with a slug — `companies_public_profile_slug_check`
     * requires one before staff can publish.
     */
    async submitForReview(actor: Actor, companyId: string): Promise<CompanyProfileRow> {
      const id = companyIdSchema.parse(companyId);
      await requireCompanyManager(actor, id);
      const database = await loadDatabase();
      const row = companyProfileRows(await database.execute(sql`
        UPDATE ${companies}
        SET public_profile_status = 'pending_review', updated_at = now()
        WHERE ${companies.id} = ${id}
          AND ${companies.publicProfileStatus} IN ('hidden', 'rejected')
          AND ${companies.slug} IS NOT NULL
        RETURNING *
      `))[0];
      if (!row) throw new Error("INVALID_PROFILE_TRANSITION");
      return row;
    },

    /**
     * Staff. The review queue, oldest edit first, with the logo the member
     * attached and the website already through `publicWebsiteUrl` — see
     * `reviewQueueRowSchema`: `SELECT companies.*` reads the raw column, and
     * this leg has no `updateProfile` in front of it.
     */
    async listForReview(actor: Actor): Promise<CompanyProfileReviewRow[]> {
      requireAdmin(actor);
      const database = await loadDatabase();
      return executedRows(await database.execute(sql`
        SELECT ${companies}.*, ${media.url} AS logo_url
        FROM ${companies}
        LEFT JOIN ${media} ON ${media.id} = ${companies.logoMediaId} AND ${media.archivedAt} IS NULL
        WHERE ${companies.publicProfileStatus} = 'pending_review'
        ORDER BY ${companies.updatedAt} ASC
      `)).map((row) => reviewQueueRowSchema.parse(row));
    },

    /** Staff. The decision and its audit row commit together, or neither does. */
    async review(actor: Actor, companyId: string, decision: unknown): Promise<CompanyProfileRow> {
      requireAdmin(actor);
      const id = companyIdSchema.parse(companyId);
      const parsed = reviewDecisionSchema.parse(decision);
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        // FOR UPDATE: two reviewers deciding the same profile must serialise, so
        // the transition check below sees the other's outcome, not stale state.
        const current = companyProfileRows(await transaction.execute(sql`
          SELECT * FROM ${companies} WHERE ${companies.id} = ${id} FOR UPDATE
        `))[0];
        if (!current) throw new Error("COMPANY_NOT_FOUND");
        if (current.public_profile_status !== "pending_review") throw new Error("INVALID_PROFILE_TRANSITION");
        const approved = parsed.decision === "approve";
        // `companies_public_profile_slug_check` (published implies a slug) would
        // abort the transaction; refuse in the repository so the reviewer gets a
        // field error instead of a failed query.
        if (approved && !current.slug) throw new Error("COMPANY_SLUG_REQUIRED");
        const reason = approved ? null : parsed.reason;
        // First publication stamps `public_profile_published_at`; a later
        // re-approval and every rejection leave it as it is.
        const publishedAt = approved
          ? sql`COALESCE(${companies.publicProfilePublishedAt}, now())`
          : companies.publicProfilePublishedAt;
        const updated = companyProfileRows(await transaction.execute(sql`
          UPDATE ${companies} SET
            public_profile_status = ${approved ? sql`'published'` : sql`'rejected'`},
            public_profile_published_at = ${publishedAt},
            profile_reviewed_at = now(),
            profile_reviewed_by_profile_id = ${actor.profileId},
            profile_rejection_reason = ${reason},
            updated_at = now()
          WHERE ${companies.id} = ${id}
          RETURNING *
        `))[0];
        if (!updated) throw new Error("COMPANY_NOT_FOUND");
        await transaction.execute(sql`
          INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
          VALUES (${actor.profileId}, ${actor.kind}, ${approved ? "company.profile.approved" : "company.profile.rejected"}, 'company', ${id},
                  ${JSON.stringify({slug: current.slug ?? null, reason})}::jsonb)
        `);
        return updated;
      });
    },
  };
}

export const companyProfilesRepository = createCompanyProfilesRepository();
