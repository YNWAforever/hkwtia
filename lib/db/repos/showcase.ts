import "server-only";

import {and, asc, desc, eq, ilike, or, sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {
  leads,
  showcaseListings,
  type Lead,
  type NewLead,
  type ShowcaseListing,
} from "@/lib/db/server-schema";
import {requireMember, type Actor, type AdminActor, type CompanyRole} from "@/lib/membership/lifecycle";
import {
  listingInputSchema,
  type ListingInput,
  parseShowcaseFilters,
  transitionListingStatus,
  type ShowcaseFilters,
} from "@/lib/showcase/contracts";

const listingIdSchema = z.string().uuid().or(z.string().min(1));
const slugSchema = z.string().min(2).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export type ShowcaseStore = Readonly<{
  getByCompany: (companyId: string) => Promise<ShowcaseListing | null>;
  getById: (id: string) => Promise<ShowcaseListing | null>;
  upsert: (companyId: string, input: ListingInput, status: "draft" | "pending_review") => Promise<ShowcaseListing>;
  listForReview: () => Promise<readonly ShowcaseListing[]>;
  setStatus: (id: string, status: "published" | "rejected" | "pending_review", reviewerId: string, rejectionReason?: string | null) => Promise<ShowcaseListing | null>;
  setPremium: (id: string, premium: boolean) => Promise<ShowcaseListing | null>;
  listPublished: (filters: ShowcaseFilters) => Promise<readonly ShowcaseListing[]>;
  getPublishedBySlug: (slug: string) => Promise<ShowcaseListing | null>;
  listPublishedSlugs: () => Promise<readonly string[]>;
  incrementViews: (slug: string) => Promise<void>;
  insertLead: (input: NewLead) => Promise<Lead | null>;
}>;

export type ShowcaseRepositoryDependencies = Readonly<{
  store?: ShowcaseStore;
  getCompanyRole?: (actor: Extract<Actor, {kind: "member"}>, companyId: string) => Promise<CompanyRole | null>;
}>;

export type ShowcaseRepository = Readonly<{
  getByCompany: (actor: Actor, companyId: string) => Promise<ShowcaseListing | null>;
  upsertDraft: (actor: Actor, companyId: string, input: unknown, status?: "draft" | "pending_review") => Promise<ShowcaseListing>;
  submitForReview: (actor: Actor, companyId: string, input: unknown) => Promise<ShowcaseListing>;
  listForReview: (actor: AdminActor) => Promise<readonly ShowcaseListing[]>;
  publish: (actor: AdminActor, id: string) => Promise<ShowcaseListing | null>;
  reject: (actor: AdminActor, id: string, reason: string) => Promise<ShowcaseListing | null>;
  setPremium: (actor: AdminActor, id: string, premium: boolean) => Promise<ShowcaseListing | null>;
  listPublished: (filters: ShowcaseFilters | Readonly<Record<string, unknown>>) => Promise<readonly ShowcaseListing[]>;
  getPublishedBySlug: (slug: string) => Promise<ShowcaseListing | null>;
  listPublishedSlugs: () => Promise<readonly string[]>;
  recordView: (slug: string) => Promise<void>;
  createLead: (input: NewLead) => Promise<Lead | null>;
}>;

function publicSort(rows: readonly ShowcaseListing[]): ShowcaseListing[] {
  return rows
    .filter((row) => row.status === "published")
    .slice()
    .sort((left, right) => Number(right.premium) - Number(left.premium)
      || left.category.localeCompare(right.category)
      || left.nameEn.localeCompare(right.nameEn)
      || left.slug.localeCompare(right.slug));
}

export function orderShowcaseListings(rows: readonly ShowcaseListing[]): ShowcaseListing[] {
  return publicSort(rows);
}

function arrayContains(column: unknown, value: string) {
  return sql`${column} @> ARRAY[${value}]::text[]`;
}

function databaseStore(loadDatabase: () => Promise<Database> = getDb): ShowcaseStore {
  return {
    async getByCompany(companyId) {
      const database = await loadDatabase();
      return (await database.select().from(showcaseListings).where(eq(showcaseListings.companyId, companyId)).limit(1))[0] ?? null;
    },
    async getById(id) {
      const database = await loadDatabase();
      return (await database.select().from(showcaseListings).where(eq(showcaseListings.id, id)).limit(1))[0] ?? null;
    },
    async upsert(companyId, input, status) {
      const database = await loadDatabase();
      const current = (await database.select({memberSince: showcaseListings.memberSince}).from(showcaseListings).where(eq(showcaseListings.companyId, companyId)).limit(1))[0];
      const [row] = await database.insert(showcaseListings).values({
        companyId,
        slug: input.slug,
        status,
        premium: false,
        views: 0,
        memberSince: current?.memberSince ?? new Date().toISOString().slice(0, 10),
        nameEn: input.nameEn,
        nameZhHk: input.nameZhHk,
        taglineEn: input.taglineEn,
        taglineZhHk: input.taglineZhHk,
        descriptionEn: input.descriptionEn,
        descriptionZhHk: input.descriptionZhHk,
        category: input.category,
        useCases: input.useCases,
        deploymentOptions: input.deploymentOptions,
        supportedLanguages: input.supportedLanguages,
        worksWith: input.worksWith,
        videoUrl: input.videoUrl,
        caseStudyUrl: input.caseStudyUrl,
        caseStudySummaryEn: input.caseStudySummaryEn,
        caseStudySummaryZhHk: input.caseStudySummaryZhHk,
        logoReference: input.logoReference,
        reviewedAt: null,
        reviewedByProfileId: null,
        rejectionReason: null,
      }).onConflictDoUpdate({
        target: [showcaseListings.companyId],
        set: {
          slug: input.slug,
          status,
          nameEn: input.nameEn,
          nameZhHk: input.nameZhHk,
          taglineEn: input.taglineEn,
          taglineZhHk: input.taglineZhHk,
          descriptionEn: input.descriptionEn,
          descriptionZhHk: input.descriptionZhHk,
          category: input.category,
          useCases: input.useCases,
          deploymentOptions: input.deploymentOptions,
          supportedLanguages: input.supportedLanguages,
          worksWith: input.worksWith,
          videoUrl: input.videoUrl,
          caseStudyUrl: input.caseStudyUrl,
          caseStudySummaryEn: input.caseStudySummaryEn,
          caseStudySummaryZhHk: input.caseStudySummaryZhHk,
          logoReference: input.logoReference,
          reviewedAt: null,
          reviewedByProfileId: null,
          rejectionReason: null,
          updatedAt: new Date(),
        },
      }).returning();
      if (!row) throw new Error("SHOWCASE_LISTING_WRITE_FAILED");
      return row;
    },
    async listForReview() {
      const database = await loadDatabase();
      return database.select().from(showcaseListings).orderBy(desc(showcaseListings.updatedAt), asc(showcaseListings.slug));
    },
    async setStatus(id, status, reviewerId, rejectionReason = null) {
      const database = await loadDatabase();
      return (await database.update(showcaseListings).set({
        status,
        reviewedAt: new Date(),
        reviewedByProfileId: reviewerId,
        rejectionReason,
        updatedAt: new Date(),
      }).where(eq(showcaseListings.id, id)).returning())[0] ?? null;
    },
    async setPremium(id, premium) {
      const database = await loadDatabase();
      return (await database.update(showcaseListings).set({premium, updatedAt: new Date()}).where(eq(showcaseListings.id, id)).returning())[0] ?? null;
    },
    async listPublished(filters) {
      const database = await loadDatabase();
      const conditions = [eq(showcaseListings.status, "published" as const)];
      if (filters.category) conditions.push(eq(showcaseListings.category, filters.category));
      if (filters.useCase) conditions.push(arrayContains(showcaseListings.useCases, filters.useCase));
      if (filters.deployment) conditions.push(arrayContains(showcaseListings.deploymentOptions, filters.deployment));
      if (filters.language) conditions.push(arrayContains(showcaseListings.supportedLanguages, filters.language));
      if (filters.worksWith) conditions.push(arrayContains(showcaseListings.worksWith, filters.worksWith));
      if (filters.q) {
        conditions.push(or(
          ilike(showcaseListings.nameEn, `%${filters.q}%`),
          ilike(showcaseListings.nameZhHk, `%${filters.q}%`),
          ilike(showcaseListings.taglineEn, `%${filters.q}%`),
          ilike(showcaseListings.taglineZhHk, `%${filters.q}%`),
          ilike(showcaseListings.descriptionEn, `%${filters.q}%`),
          ilike(showcaseListings.descriptionZhHk, `%${filters.q}%`),
        )!);
      }
      return database.select().from(showcaseListings)
        .where(and(...conditions))
        .orderBy(desc(showcaseListings.premium), asc(showcaseListings.category), asc(showcaseListings.nameEn), asc(showcaseListings.slug));
    },
    async getPublishedBySlug(slug) {
      const database = await loadDatabase();
      return (await database.select().from(showcaseListings).where(and(eq(showcaseListings.slug, slug), eq(showcaseListings.status, "published"))).limit(1))[0] ?? null;
    },
    async listPublishedSlugs() {
      const database = await loadDatabase();
      const rows = await database.select({slug: showcaseListings.slug}).from(showcaseListings).where(eq(showcaseListings.status, "published")).orderBy(asc(showcaseListings.slug));
      return rows.map((row) => row.slug);
    },
    async incrementViews(slug) {
      const database = await loadDatabase();
      await database.update(showcaseListings)
        .set({views: sql`${showcaseListings.views} + 1`, updatedAt: new Date()})
        .where(and(eq(showcaseListings.slug, slug), eq(showcaseListings.status, "published")));
    },
    async insertLead(input) {
      const database = await loadDatabase();
      return (await database.insert(leads).values(input).onConflictDoNothing({target: leads.idempotencyKey}).returning())[0] ?? null;
    },
  };
}

async function ensureCompanyRole(
  actor: Actor,
  companyId: string,
  getCompanyRole: ShowcaseRepositoryDependencies["getCompanyRole"],
): Promise<Extract<Actor, {kind: "member"}> | never> {
  requireMember(actor);
  const role = await (getCompanyRole ?? portalContentRepository.getCompanyRole)(actor, companyId);
  if (!role) throw new Error("FORBIDDEN");
  return actor;
}

async function ensureCompanyManager(
  actor: Actor,
  companyId: string,
  getCompanyRole: ShowcaseRepositoryDependencies["getCompanyRole"],
): Promise<Extract<Actor, {kind: "member"}> | never> {
  const member = await ensureCompanyRole(actor, companyId, getCompanyRole);
  const role = await (getCompanyRole ?? portalContentRepository.getCompanyRole)(member, companyId);
  if (role !== "owner" && role !== "admin") throw new Error("FORBIDDEN");
  return member;
}

export function createShowcaseRepository(
  dependencies: ShowcaseRepositoryDependencies = {},
): ShowcaseRepository {
  const store = dependencies.store ?? databaseStore();
  return {
    async getByCompany(actor, companyId) {
      await ensureCompanyRole(actor, companyId, dependencies.getCompanyRole);
      return store.getByCompany(companyId);
    },
    async upsertDraft(actor, companyId, input, status = "draft") {
      await ensureCompanyManager(actor, companyId, dependencies.getCompanyRole);
      const parsed = listingInputSchema.parse(input);
      const current = await store.getByCompany(companyId);
      if (current && !transitionListingStatus(current.status, status)) throw new Error("INVALID_SHOWCASE_TRANSITION");
      return store.upsert(companyId, parsed, status);
    },
    async submitForReview(actor, companyId, input) {
      return this.upsertDraft(actor, companyId, input, "pending_review");
    },
    async listForReview(actor) {
      requireAdmin(actor);
      return store.listForReview();
    },
    async publish(actor, id) {
      requireAdmin(actor);
      const parsedId = listingIdSchema.parse(id);
      const current = await store.getById(parsedId);
      if (!current) return null;
      if (!transitionListingStatus(current.status, "published")) throw new Error("INVALID_SHOWCASE_TRANSITION");
      return store.setStatus(parsedId, "published", actor.profileId, null);
    },
    async reject(actor, id, reason) {
      requireAdmin(actor);
      const parsedId = listingIdSchema.parse(id);
      const parsedReason = z.string().trim().min(1).max(1_000).parse(reason);
      const current = await store.getById(parsedId);
      if (!current) return null;
      if (!transitionListingStatus(current.status, "rejected")) throw new Error("INVALID_SHOWCASE_TRANSITION");
      return store.setStatus(parsedId, "rejected", actor.profileId, parsedReason);
    },
    async setPremium(actor, id, premium) {
      requireAdmin(actor);
      return store.setPremium(listingIdSchema.parse(id), Boolean(premium));
    },
    async listPublished(filters) {
      const parsed = parseShowcaseFilters(filters);
      return publicSort(await store.listPublished(parsed));
    },
    async getPublishedBySlug(slug) {
      return store.getPublishedBySlug(slugSchema.parse(slug));
    },
    async listPublishedSlugs() {
      return store.listPublishedSlugs();
    },
    async recordView(slug) {
      await store.incrementViews(slugSchema.parse(slug));
    },
    async createLead(input) {
      return store.insertLead(input);
    },
  };
}

export const showcaseRepository = createShowcaseRepository();

