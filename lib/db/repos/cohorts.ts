import "server-only";

import {and, asc, eq, isNull, ne} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/actor";
import {getDb, type Database} from "@/lib/db/repos/common";
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {
  auditEvents,
  cohortApplications,
  cohorts,
  companyMembers,
  companies,
  showcaseListings,
  type Cohort,
  type CohortApplication,
} from "@/lib/db/server-schema";
import {
  parseCohortApplicationInput,
  parseCohortStage,
  publicCohortSchema,
  type CohortStage,
  type PublicCohort,
} from "@/lib/launchpad/contracts";
import {requireMember, type Actor, type AdminActor, type CompanyRole} from "@/lib/membership/lifecycle";

const applicationIdSchema = z.string().uuid();
const companyIdSchema = z.string().uuid();
const notesSchema = z.string().trim().min(1).max(4_000).nullable().optional();

const stageTransitions: Readonly<Record<CohortStage, readonly CohortStage[]>> = {
  applied: ["accepted", "rejected"],
  accepted: ["ready", "rejected"],
  ready: ["match", "rejected"],
  match: ["land", "rejected"],
  land: ["scale", "rejected"],
  scale: ["graduated", "rejected"],
  graduated: ["graduated"],
  rejected: ["rejected"],
};

export type CohortMoveInput = Readonly<{
  applicationId: string;
  expectedStage: CohortStage;
  nextStage: CohortStage;
  notes?: string | null;
  actor: AdminActor;
}>;

/** Staff-facing identity projection; deliberately omits readiness and private notes. */
export type AdminCohortApplication = Readonly<{
  id: string;
  cohortId: string;
  companyId: string;
  stage: CohortStage;
  createdAt: Date;
  updatedAt: Date;
  companyDisplayName: string;
  cohortSlug: string;
  cohortNameEn: string;
  cohortNameZhHk: string;
}>;

export type CohortStore = Readonly<{
  listPublicCohorts: (actor: Actor) => Promise<readonly PublicCohort[]>;
  findActiveCompanyId: (actor: Extract<Actor, {kind: "member"}>) => Promise<string | null>;
  getApplication: (cohortId: string, companyId: string) => Promise<CohortApplication | null>;
  getCohort: (cohortId: string) => Promise<Cohort | null>;
  createApplication: (input: Readonly<{cohortId: string; companyId: string; readiness: Record<string, unknown>}>) => Promise<CohortApplication>;
  listForAdmin: () => Promise<readonly AdminCohortApplication[]>;
  moveApplication: (input: CohortMoveInput) => Promise<CohortApplication | null>;
}>;

export type CohortRepositoryDependencies = Readonly<{
  store?: CohortStore;
  getCompanyRole?: (actor: Extract<Actor, {kind: "member"}>, companyId: string) => Promise<CompanyRole | null>;
}>;

export type CohortRepository = Readonly<{
  listPublicCohorts: (actor: Actor) => Promise<readonly PublicCohort[]>;
  getApplicationForCompany: (actor: Actor, cohortId: string, companyId: string) => Promise<CohortApplication | null>;
  createApplication: (actor: Actor, cohortId: string, input: unknown) => Promise<CohortApplication>;
  listForAdmin: (actor: AdminActor) => Promise<readonly AdminCohortApplication[]>;
  moveApplication: (actor: AdminActor, applicationId: string, nextStage: unknown, notes?: string | null) => Promise<CohortApplication | null>;
}>;

function transitionAllowed(from: CohortStage, to: CohortStage): boolean {
  return stageTransitions[from].includes(to);
}

function databaseStore(loadDatabase: () => Promise<Database> = getDb): CohortStore {
  return {
    async listPublicCohorts(_actor) {
      const database = await loadDatabase();
      const rows = await database.select({
        id: cohorts.id,
        slug: cohorts.slug,
        nameEn: cohorts.nameEn,
        nameZhHk: cohorts.nameZhHk,
        descriptionEn: cohorts.descriptionEn,
        descriptionZhHk: cohorts.descriptionZhHk,
        track: cohorts.track,
        startsOn: cohorts.startsOn,
        endsOn: cohorts.endsOn,
        capacity: cohorts.capacity,
        feeHkd: cohorts.feeHkd,
        status: cohorts.status,
      }).from(cohorts).where(ne(cohorts.status, "archived")).orderBy(asc(cohorts.startsOn), asc(cohorts.slug));
      return rows.map((row) => publicCohortSchema.parse(row));
    },
    async findActiveCompanyId(actor) {
      const database = await loadDatabase();
      const row = (await database.select({companyId: companyMembers.companyId})
        .from(companyMembers)
        .where(and(eq(companyMembers.userId, actor.profileId), isNull(companyMembers.revokedAt)))
        .orderBy(asc(companyMembers.joinedAt), asc(companyMembers.companyId))
        .limit(1))[0];
      return row?.companyId ?? null;
    },
    async getApplication(cohortId, companyId) {
      const database = await loadDatabase();
      return (await database.select().from(cohortApplications)
        .where(and(eq(cohortApplications.cohortId, cohortId), eq(cohortApplications.companyId, companyId)))
        .limit(1))[0] ?? null;
    },
    async getCohort(cohortId) {
      const database = await loadDatabase();
      return (await database.select().from(cohorts).where(eq(cohorts.id, cohortId)).limit(1))[0] ?? null;
    },
    async createApplication(input) {
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const selectedCohort = (await transaction.select({status: cohorts.status}).from(cohorts)
          .where(eq(cohorts.id, input.cohortId)).limit(1).for("update"))[0];
        if (!selectedCohort || selectedCohort.status !== "open") throw new Error("COHORT_NOT_OPEN");
        const [row] = await transaction.insert(cohortApplications).values({
          cohortId: input.cohortId,
          companyId: input.companyId,
          stage: "applied",
          readiness: input.readiness,
        }).onConflictDoNothing({target: [cohortApplications.cohortId, cohortApplications.companyId]}).returning();
        if (row) return row;
        const existing = (await transaction.select().from(cohortApplications)
          .where(and(eq(cohortApplications.cohortId, input.cohortId), eq(cohortApplications.companyId, input.companyId)))
          .limit(1))[0];
        if (!existing) throw new Error("COHORT_APPLICATION_WRITE_FAILED");
        return existing;
      });
    },
    async listForAdmin() {
      const database = await loadDatabase();
      return database.select({
        id: cohortApplications.id,
        cohortId: cohortApplications.cohortId,
        companyId: cohortApplications.companyId,
        stage: cohortApplications.stage,
        createdAt: cohortApplications.createdAt,
        updatedAt: cohortApplications.updatedAt,
        companyDisplayName: companies.displayName,
        cohortSlug: cohorts.slug,
        cohortNameEn: cohorts.nameEn,
        cohortNameZhHk: cohorts.nameZhHk,
      }).from(cohortApplications)
        .innerJoin(companies, eq(cohortApplications.companyId, companies.id))
        .innerJoin(cohorts, eq(cohortApplications.cohortId, cohorts.id))
        .orderBy(asc(cohortApplications.cohortId), asc(cohortApplications.stage), asc(cohortApplications.createdAt));
    },
    async moveApplication(input) {
      const database = await loadDatabase();
      return database.transaction(async (transaction) => {
        const current = (await transaction.select().from(cohortApplications)
          .where(eq(cohortApplications.id, input.applicationId)).limit(1))[0];
        if (!current) return null;
        if (current.stage !== input.expectedStage) throw new Error("COHORT_APPLICATION_CONCURRENT_UPDATE");

        await transaction.insert(auditEvents).values({
          actorUserId: input.actor.profileId,
          actorType: input.actor.kind,
          action: "cohort_application.stage_changed",
          targetType: "cohort_application",
          targetId: current.id,
          metadata: {fromStage: input.expectedStage, toStage: input.nextStage},
        });
        const [updated] = await transaction.update(cohortApplications).set({
          stage: input.nextStage,
          notes: input.notes ?? current.notes,
          updatedAt: new Date(),
        }).where(and(eq(cohortApplications.id, current.id), eq(cohortApplications.stage, input.expectedStage))).returning();
        if (!updated) throw new Error("COHORT_APPLICATION_CONCURRENT_UPDATE");
        if (input.nextStage === "graduated") {
          await transaction.update(showcaseListings).set({goneGlobal: true, updatedAt: new Date()})
            .where(eq(showcaseListings.companyId, updated.companyId));
        }
        return updated;
      });
    },
  };
}

async function requireCompanyAccess(
  actor: Actor,
  companyId: string,
  getCompanyRole: CohortRepositoryDependencies["getCompanyRole"],
): Promise<Extract<Actor, {kind: "member"}>> {
  requireMember(actor);
  const role = await (getCompanyRole ?? portalContentRepository.getCompanyRole)(actor, companyId);
  if (!role) throw new Error("FORBIDDEN");
  return actor;
}

async function requireCompanyManager(
  actor: Actor,
  companyId: string,
  getCompanyRole: CohortRepositoryDependencies["getCompanyRole"],
): Promise<Extract<Actor, {kind: "member"}>> {
  requireMember(actor);
  const role = await (getCompanyRole ?? portalContentRepository.getCompanyRole)(actor, companyId);
  if (role !== "owner" && role !== "admin") throw new Error("FORBIDDEN");
  return actor;
}

export function createCohortRepository(
  dependencies: CohortRepositoryDependencies = {},
): CohortRepository {
  const store = dependencies.store ?? databaseStore();
  return {
    async listPublicCohorts(actor) {
      return store.listPublicCohorts(actor);
    },
    async getApplicationForCompany(actor, cohortId, companyId) {
      const parsedCohortId = applicationIdSchema.parse(cohortId);
      const parsedCompanyId = companyIdSchema.parse(companyId);
      await requireCompanyAccess(actor, parsedCompanyId, dependencies.getCompanyRole);
      return store.getApplication(parsedCohortId, parsedCompanyId);
    },
    async createApplication(actor, cohortId, input) {
      requireMember(actor);
      const parsedCohortId = applicationIdSchema.parse(cohortId);
      const parsedInput = parseCohortApplicationInput(input);
      if (parsedInput.cohortId !== parsedCohortId) throw new Error("COHORT_APPLICATION_COHORT_MISMATCH");
      const companyId = await store.findActiveCompanyId(actor);
      if (!companyId) throw new Error("FORBIDDEN");
      await requireCompanyManager(actor, companyId, dependencies.getCompanyRole);
      const current = await store.getApplication(parsedCohortId, companyId);
      if (current) return current;
      const selectedCohort = await store.getCohort(parsedCohortId);
      if (!selectedCohort || selectedCohort.status !== "open") throw new Error("COHORT_NOT_OPEN");
      return store.createApplication({cohortId: parsedCohortId, companyId, readiness: parsedInput.readiness});
    },
    async listForAdmin(actor) {
      requireAdmin(actor);
      return store.listForAdmin();
    },
    async moveApplication(actor, applicationId, nextStage, notes) {
      requireAdmin(actor);
      const parsedApplicationId = applicationIdSchema.parse(applicationId);
      const parsedNextStage = parseCohortStage(nextStage);
      const parsedNotes = notesSchema.parse(notes);
      const current = (await store.listForAdmin()).find((row) => row.id === parsedApplicationId) ?? null;
      if (!current) return null;
      if (!transitionAllowed(current.stage, parsedNextStage)) throw new Error("INVALID_COHORT_STAGE_TRANSITION");
      return store.moveApplication({
        applicationId: parsedApplicationId,
        expectedStage: current.stage,
        nextStage: parsedNextStage,
        notes: parsedNotes,
        actor,
      });
    },
  };
}

export const cohortRepository = createCohortRepository();
