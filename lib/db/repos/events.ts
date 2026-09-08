import "server-only";

import {and, asc, count, desc, eq, gte, inArray, isNull, lt, or, sql} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import type {AutomationDatabase, AutomationDatabaseLoader} from "@/lib/db/repos/journeys";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {portalContentRepository} from "@/lib/db/repos/portal-content";
import {auditEvents, companyMembers, eventRegistrations, events, media, memberships, profiles, type Event, type EventStatus, type EventVisibility} from "@/lib/db/server-schema";
import {assertCanSubmitEvent} from "@/lib/events/entitlement-core";
import {eventBoundary, type PublicEventProjection, type PublicEventStatus} from "@/lib/events/public";
import {canTransitionEvent, derivedEventFlags, hongKongQuarterBounds} from "@/lib/events/status";
import {isPrivateMediaDeliveryUrl, isRegistrableMediaUrl} from "@/lib/media/url";
import type {MembershipPlanCode} from "@/lib/membership/constants";
import {requireMember, type Actor, type AdminActor, type CompanyRole} from "@/lib/membership/lifecycle";

const eventIdSchema = z.string().uuid();
const slugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const publicReadLimitSchema = z.number().int().min(1).max(12);
const eventInputObjectSchema = z.object({
  slug: slugSchema,
  titleEn: z.string().trim().min(1).max(200),
  titleZh: z.string().trim().min(1).max(200).nullable().optional().default(null),
  descriptionEn: z.string().trim().min(1).max(10_000),
  descriptionZh: z.string().trim().min(1).max(10_000).nullable().optional().default(null),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().nullable().optional().default(null),
  venue: z.string().trim().min(1).max(500).nullable().optional().default(null),
  capacity: z.number().int().positive().nullable().optional().default(null),
  memberOnly: z.boolean().optional().default(false),
  published: z.boolean().optional().default(false),
  heroMediaId: z.string().uuid().nullable().optional().default(null),
  // Phase B1 (D-12). All optional so the admin form keeps sending only the
  // booleans; `reconciledEventFlags` writes both pairs whichever arrives.
  status: z.enum(["draft", "pending_review", "published", "rejected", "cancelled"]).optional(),
  visibility: z.enum(["public", "members_only", "invite_only"]).optional(),
  format: z.enum(["in_person", "online", "hybrid"]).default("in_person"),
  onlineUrl: z.string().trim().url().max(500).nullable().optional(),
  registrationMode: z.enum(["rsvp", "external", "ticketed"]).default("rsvp"),
  externalRegistrationUrl: z.string().trim().url().max(500).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
}).strict();
// Mirrors the `events_online_url_check` and `events_external_registration_check`
// constraints so a bad form fails validation instead of a transaction.
function addEventShapeIssues(
  input: Readonly<{startsAt?: Date; endsAt?: Date | null; format?: string; onlineUrl?: string | null; registrationMode?: string; externalRegistrationUrl?: string | null}>,
  context: z.RefinementCtx,
): void {
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) context.addIssue({code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt"});
  if (input.format !== undefined && input.format !== "in_person" && !input.onlineUrl) context.addIssue({code: z.ZodIssueCode.custom, path: ["onlineUrl"], message: "onlineUrl is required for online and hybrid events"});
  if (input.registrationMode === "external" && !input.externalRegistrationUrl) context.addIssue({code: z.ZodIssueCode.custom, path: ["externalRegistrationUrl"], message: "externalRegistrationUrl is required for external registration"});
}
const eventInputSchema = eventInputObjectSchema.superRefine(addEventShapeIssues);
const eventUpdateSchema = eventInputObjectSchema.partial().superRefine((input, context) => {
  if (Object.keys(input).length === 0) context.addIssue({code: z.ZodIssueCode.custom, message: "event update is empty"});
  addEventShapeIssues(input, context);
});
const eventPeriodSchema = z.object({startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable()}).superRefine((input, context) => {
  if (input.endsAt && input.endsAt <= input.startsAt) context.addIssue({code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt"});
});
const registrationInputSchema = z.object({eventId: eventIdSchema}).strict();

type ReconciledEventFlags = Readonly<{status: EventStatus; visibility: EventVisibility; published: boolean; memberOnly: boolean}>;
type StoredEventInput = z.output<typeof eventInputSchema> & ReconciledEventFlags & Readonly<{publishedAt: Date | null}>;
type StoredEventUpdate = z.output<typeof eventUpdateSchema> & ReconciledEventFlags & Readonly<{publishedAt: Date | null}>;
type EventAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"] | "member";
  action: "event.created" | "event.updated" | "event.registration.created";
  targetType: "event";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type EventRows = readonly Event[] | Readonly<{list: () => Promise<readonly Event[]>}>;
export type FeaturedPublicEventOptions = Readonly<{asOf: Date; limit: number; locale?: string}>;
type PublicEventHeroSource = Readonly<{url: string; altEn: string; altZh: string; archivedAt: Date | null}>;
type PublicEventMemoryRow = Readonly<{event: Event; hero: PublicEventHeroSource | null}>;
export type PublicEventSource = readonly (Event | PublicEventMemoryRow)[] | Readonly<{list: () => Promise<readonly (Event | PublicEventMemoryRow)[]>}>;
export type PublicEventReadOptions = Readonly<{status: PublicEventStatus; asOf: Date; locale?: string; limit?: number; source?: PublicEventSource}>;
export type PublicEventSlugOptions = Readonly<{asOf: Date; source?: PublicEventSource}>;
export type MemberEventEligibility = Readonly<{hasEligibleMembership: (actor: Extract<Actor, {kind: "member"}>) => Promise<boolean>}>;
export type EventMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  insertEvent: (input: StoredEventInput) => Promise<Event>;
  lockEvent: (id: string) => Promise<Event | null>;
  updateEvent: (id: string, input: StoredEventUpdate) => Promise<Event | null>;
  lockActiveMedia: (id: string) => Promise<Readonly<{id: string; archivedAt: Date | null}> | null>;
  insertAudit: (input: EventAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;
export type RegistrationStatus = "registered" | "waitlist" | "cancelled" | "attended" | "no_show";
export type EventRegistrationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  lockEvent: (eventId: string) => Promise<Readonly<{id: string; capacity: number | null; published: boolean; startsAt: Date; endsAt: Date | null}> | null>;
  hasEligibleMembership: (profileId: string) => Promise<boolean>;
  getRegistration: (eventId: string, profileId: string) => Promise<Readonly<{status: RegistrationStatus}> | null>;
  countRegistered: (eventId: string) => Promise<number>;
  upsertRegistration: (eventId: string, profileId: string, status: "registered" | "waitlist") => Promise<void>;
  insertAudit: (input: EventAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>; now?: () => Date}>;

export type LocalizedEvent = Readonly<{
  id: string; slug: string; title: string; description: string; startsAt: string; endsAt: string | null;
  venue: string | null; capacity: number | null; memberOnly: boolean; published: boolean;
}>;

async function rowsFrom(source?: EventRows): Promise<readonly Event[]> {
  if (source && "list" in source) return source.list();
  if (source) return source;
  const db = await getDb();
  return db.select().from(events).orderBy(asc(events.startsAt), asc(events.slug));
}

function sorted(rows: readonly Event[]): Event[] {
  return [...rows].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.slug.localeCompare(right.slug));
}

function isPublicMemoryRow(row: Event | PublicEventMemoryRow): row is PublicEventMemoryRow {
  return "event" in row;
}

async function publicRowsFrom(source?: PublicEventSource): Promise<readonly PublicEventMemoryRow[]> {
  if (source) {
    const rows = "list" in source ? await source.list() : source;
    return rows.map((row) => isPublicMemoryRow(row) ? row : {event: row, hero: null});
  }
  const database = await getDb();
  const rows = await database.select({
    event: events,
    hero: {url: media.url, altEn: media.altEn, altZh: media.altZh, archivedAt: media.archivedAt},
  }).from(events).leftJoin(media, eq(events.heroMediaId, media.id));
  return rows.map((row) => ({event: row.event, hero: row.hero === null || row.hero.url === null ? null : row.hero as PublicEventHeroSource}));
}

function projectPublicEvent(row: PublicEventMemoryRow, locale: string): PublicEventProjection {
  const {event, hero} = row;
  const useChinese = locale === "zh-HK";
  return {
    id: event.id,
    slug: event.slug,
    title: useChinese && event.titleZh ? event.titleZh : event.titleEn,
    description: useChinese && event.descriptionZh ? event.descriptionZh : event.descriptionEn,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    venue: event.venue,
    capacity: event.capacity,
    hero: hero && hero.archivedAt === null && (isPrivateMediaDeliveryUrl(hero.url) || isRegistrableMediaUrl(hero.url)) ? {url: hero.url, alt: useChinese ? hero.altZh : hero.altEn} : null,
  };
}

// S-1: public reads decide on the enums, never the legacy booleans.
function isPubliclyVisible(event: Pick<Event, "status" | "visibility">): boolean {
  return event.status === "published" && event.visibility === "public";
}

function publicRowsByStatus(rows: readonly PublicEventMemoryRow[], status: PublicEventStatus, asOf: Date): PublicEventMemoryRow[] {
  return rows
    .filter(({event}) => isPubliclyVisible(event))
    .filter(({event}) => status === "open" ? eventBoundary(event) >= asOf : eventBoundary(event) < asOf)
    .toSorted((left, right) => {
      const boundaryOrder = eventBoundary(left.event).getTime() - eventBoundary(right.event).getTime();
      const timeOrder = status === "open" ? boundaryOrder : -boundaryOrder;
      return timeOrder || left.event.slug.localeCompare(right.event.slug) || left.event.id.localeCompare(right.event.id);
    });
}

export async function listPublicEvents(_actor: Actor, options: PublicEventReadOptions): Promise<PublicEventProjection[]> {
  const limit = options.limit === undefined ? undefined : publicReadLimitSchema.parse(options.limit);
  const asOf = z.coerce.date().parse(options.asOf);
  const locale = options.locale ?? "en";
  if (options.source) {
    const rows = publicRowsByStatus(await publicRowsFrom(options.source), options.status, asOf);
    return (limit === undefined ? rows : rows.slice(0, limit)).map((row) => projectPublicEvent(row, locale));
  }
  const boundary = sql<Date>`coalesce(${events.endsAt}, ${events.startsAt})`;
  const predicate = options.status === "open" ? gte(boundary, asOf) : lt(boundary, asOf);
  const order = options.status === "open" ? [asc(boundary), asc(events.slug), asc(events.id)] : [desc(boundary), asc(events.slug), asc(events.id)];
  const database = await getDb();
  const query = database.select({
    event: events,
    hero: {url: media.url, altEn: media.altEn, altZh: media.altZh, archivedAt: media.archivedAt},
  }).from(events).leftJoin(media, eq(events.heroMediaId, media.id))
    .where(and(eq(events.status, "published"), eq(events.visibility, "public"), predicate)).orderBy(...order);
  const rows = await (limit === undefined ? query : query.limit(limit));
  return rows.map((row) => projectPublicEvent({event: row.event, hero: row.hero === null || row.hero.url === null ? null : row.hero as PublicEventHeroSource}, locale));
}

export type PublicEventCountOptions = Readonly<{status: PublicEventStatus; asOf: Date; source?: PublicEventSource}>;

// Aggregate count, not a capped list read: this backs figures like the homepage's
// "past events" tile, which must reflect the true historical total rather than the
// 12-row cap listPublicEvents enforces for paginated public list pages.
export async function countPublicEvents(_actor: Actor, options: PublicEventCountOptions): Promise<number> {
  const asOf = z.coerce.date().parse(options.asOf);
  if (options.source) {
    return publicRowsByStatus(await publicRowsFrom(options.source), options.status, asOf).length;
  }
  const boundary = sql<Date>`coalesce(${events.endsAt}, ${events.startsAt})`;
  const predicate = options.status === "open" ? gte(boundary, asOf) : lt(boundary, asOf);
  const database = await getDb();
  const [row] = await database.select({value: count()}).from(events)
    .where(and(eq(events.status, "published"), eq(events.visibility, "public"), predicate));
  return Number(row?.value ?? 0);
}

export async function getPublicEventBySlug(slug: unknown, locale: string, options: PublicEventSlugOptions): Promise<PublicEventProjection | null> {
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) return null;
  if (options.source) {
    const row = (await publicRowsFrom(options.source)).find(({event}) => event.slug === parsedSlug.data && isPubliclyVisible(event));
    return row ? projectPublicEvent(row, locale) : null;
  }
  const database = await getDb();
  const [row] = await database.select({
    event: events,
    hero: {url: media.url, altEn: media.altEn, altZh: media.altZh, archivedAt: media.archivedAt},
  }).from(events).leftJoin(media, eq(events.heroMediaId, media.id))
    .where(and(eq(events.slug, parsedSlug.data), eq(events.status, "published"), eq(events.visibility, "public"))).limit(1);
  if (!row) return null;
  return projectPublicEvent({event: row.event, hero: row.hero === null || row.hero.url === null ? null : row.hero as PublicEventHeroSource}, locale);
}

export async function listFeaturedPublicEvents(
  actor: Actor,
  options: FeaturedPublicEventOptions,
  source?: PublicEventSource,
): Promise<PublicEventProjection[]> {
  return listPublicEvents(actor, {
    status: "open",
    asOf: options.asOf,
    locale: options.locale,
    limit: options.limit,
    source,
  });
}

const eligibleStatuses = ["active", "past_due", "cancel_at_period_end"] as const;
const defaultMemberEligibility: MemberEventEligibility = {hasEligibleMembership: async (actor) => (await membershipsRepository.list(actor)).some((membership) => (eligibleStatuses as readonly string[]).includes(membership.status))};

export async function listMemberEvents(actor: Actor, source?: EventRows, eligibility: MemberEventEligibility = defaultMemberEligibility): Promise<Event[]> {
  requireMember(actor);
  if (!await eligibility.hasEligibleMembership(actor)) throw new Error("MEMBERSHIP_INACTIVE");
  return sorted((await rowsFrom(source)).filter(isMemberVisible));
}

// Members see every published event that is not invite-only. The default
// source lists the whole table; the in-memory branch applies the same rule
// so tests exercise the filter the database query would.
function isMemberVisible(event: Pick<Event, "status" | "visibility">): boolean {
  return event.status === "published" && event.visibility !== "invite_only";
}

export function localizeEvent(event: Event, locale: string): LocalizedEvent {
  const useChinese = locale === "zh-HK";
  return {
    id: event.id,
    slug: event.slug,
    title: useChinese && event.titleZh ? event.titleZh : event.titleEn,
    description: useChinese && event.descriptionZh ? event.descriptionZh : event.descriptionEn,
    startsAt: event.startsAt.toISOString(),
    endsAt: event.endsAt?.toISOString() ?? null,
    venue: event.venue,
    capacity: event.capacity,
    memberOnly: event.memberOnly,
    published: event.published,
  };
}

/**
 * Admin forms still send `published`/`memberOnly`; member forms send
 * `status`/`visibility`. Whichever arrives, both pairs are written (D-12).
 * A boolean update never invents a review state: un-publishing a published
 * row returns it to `draft`, and `published: true` on a row still under
 * review is the staff shortcut that publishes it.
 */
export function reconciledEventFlags(
  input: Readonly<{published?: boolean; memberOnly?: boolean; status?: EventStatus; visibility?: EventVisibility}>,
  current?: Readonly<{status: EventStatus; visibility: EventVisibility}>,
): ReconciledEventFlags {
  const fallbackStatus = current?.status ?? "draft";
  const status: EventStatus = input.status
    ?? (input.published === undefined ? fallbackStatus : input.published ? "published" : (fallbackStatus === "published" ? "draft" : fallbackStatus));
  const visibility: EventVisibility = input.visibility
    ?? (input.memberOnly === undefined ? (current?.visibility ?? "public") : input.memberOnly ? "members_only" : "public");
  return {status, visibility, ...derivedEventFlags({status, visibility})};
}

async function defaultMutationDependencies(): Promise<EventMutationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    insertEvent: async (input) => {
      const [row] = await tx.insert(events).values(input).returning();
      if (!row) throw new Error("EVENT_INSERT_FAILED");
      return row;
    },
    lockEvent: async (id) => (await tx.select().from(events).where(eq(events.id, id)).for("update"))[0] ?? null,
    updateEvent: async (id, input) => (await tx.update(events).set({...input, updatedAt: new Date()}).where(eq(events.id, id)).returning())[0] ?? null,
    lockActiveMedia: async (id) => (await tx.select({id: media.id, archivedAt: media.archivedAt}).from(media).where(eq(media.id, id)).for("update"))[0] ?? null,
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

export async function createEvent(actor: Actor, input: unknown, dependencies?: EventMutationDependencies): Promise<Event> {
  requireAdmin(actor);
  const parsed = eventInputSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    if (parsed.heroMediaId !== null) {
      const mediaRow = await transaction.lockActiveMedia(parsed.heroMediaId);
      if (!mediaRow || mediaRow.archivedAt !== null) throw new z.ZodError([{code: z.ZodIssueCode.custom, path: ["heroMediaId"], message: "EVENT_HERO_MEDIA_INVALID"}]);
    }
    const flags = reconciledEventFlags(parsed);
    const event = await transaction.insertEvent({...parsed, ...flags, publishedAt: flags.status === "published" ? new Date() : null});
    await transaction.insertAudit({actorUserId: actor.profileId, actorType: actor.kind, action: "event.created", targetType: "event", targetId: event.id, metadata: {slug: event.slug}});
    return event;
  });
}

export async function updateEvent(actor: Actor, id: unknown, input: unknown, dependencies?: EventMutationDependencies): Promise<Event | null> {
  requireAdmin(actor);
  const eventId = eventIdSchema.parse(id);
  const parsed = eventUpdateSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const current = await transaction.lockEvent(eventId);
    if (!current) return null;
    eventPeriodSchema.parse({startsAt: parsed.startsAt ?? current.startsAt, endsAt: parsed.endsAt === undefined ? current.endsAt : parsed.endsAt});
    if (parsed.heroMediaId !== undefined && parsed.heroMediaId !== null) {
      const mediaRow = await transaction.lockActiveMedia(parsed.heroMediaId);
      if (!mediaRow || mediaRow.archivedAt !== null) throw new z.ZodError([{code: z.ZodIssueCode.custom, path: ["heroMediaId"], message: "EVENT_HERO_MEDIA_INVALID"}]);
    }
    const flags = reconciledEventFlags(parsed, {status: current.status, visibility: current.visibility});
    const event = await transaction.updateEvent(eventId, {...parsed, ...flags, publishedAt: flags.status === "published" ? (current.publishedAt ?? new Date()) : null});
    if (!event) return null;
    await transaction.insertAudit({actorUserId: actor.profileId, actorType: actor.kind, action: "event.updated", targetType: "event", targetId: event.id, metadata: {fields: Object.keys(parsed).sort()}});
    return event;
  });
}

async function defaultRegistrationDependencies(): Promise<EventRegistrationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    lockEvent: async (eventId) => (await tx.select({id: events.id, capacity: events.capacity, published: events.published, startsAt: events.startsAt, endsAt: events.endsAt}).from(events).where(eq(events.id, eventId)).for("update"))[0] ?? null,
    hasEligibleMembership: async (profileId) => Boolean((await tx.select({id: memberships.id}).from(memberships)
      .leftJoin(companyMembers, and(eq(companyMembers.companyId, memberships.companyId), eq(companyMembers.userId, profileId), isNull(companyMembers.revokedAt)))
      .where(and(or(eq(memberships.ownerUserId, profileId), eq(companyMembers.userId, profileId)), inArray(memberships.status, eligibleStatuses))).limit(1))[0]),
    getRegistration: async (eventId, profileId) => (await tx.select({status: eventRegistrations.status}).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.profileId, profileId))))[0] ?? null,
    countRegistered: async (eventId) => Number((await tx.select({value: count()}).from(eventRegistrations).where(and(eq(eventRegistrations.eventId, eventId), inArray(eventRegistrations.status, ["registered", "attended"]))))[0]?.value ?? 0),
    upsertRegistration: async (eventId, profileId, status) => { await tx.insert(eventRegistrations).values({eventId, profileId, status, checkedInAt: null}).onConflictDoUpdate({target: [eventRegistrations.eventId, eventRegistrations.profileId], set: {status, checkedInAt: null}}); },
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

export async function registerForEvent(actor: Actor, input: unknown, dependencies?: EventRegistrationDependencies): Promise<Readonly<{disposition: "registered" | "waitlist" | "already_registered" | "already_waitlisted"}>> {
  requireMember(actor);
  const {eventId} = registrationInputSchema.parse(input);
  const resolved = dependencies ?? await defaultRegistrationDependencies();
  return resolved.transaction(async (transaction) => {
    const event = await transaction.lockEvent(eventId);
    if (!event || !event.published) throw new Error("EVENT_NOT_FOUND");
    if (eventBoundary(event) < (resolved.now?.() ?? new Date())) throw new Error("EVENT_REGISTRATION_CLOSED");
    if (!await transaction.hasEligibleMembership(actor.profileId)) throw new Error("MEMBERSHIP_INACTIVE");
    const existing = await transaction.getRegistration(eventId, actor.profileId);
    if (existing?.status === "registered" || existing?.status === "attended") return {disposition: "already_registered"};
    if (existing?.status === "waitlist") return {disposition: "already_waitlisted"};
    const disposition = event.capacity !== null && await transaction.countRegistered(eventId) >= event.capacity ? "waitlist" : "registered";
    await transaction.upsertRegistration(eventId, actor.profileId, disposition);
    await transaction.insertAudit({actorUserId: actor.profileId, actorType: "member", action: "event.registration.created", targetType: "event", targetId: eventId, metadata: {disposition}});
    return {disposition};
  });
}

export async function getEventBySlug(actor: Actor, slug: unknown, source?: EventRows): Promise<Event | null> {
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) return null;
  const row = (await rowsFrom(source)).find((event) => event.slug === parsedSlug.data) ?? null;
  if (!row) return null;
  if (actor.kind === "anonymous") return isPubliclyVisible(row) ? row : null;
  if (actor.kind === "member") return isMemberVisible(row) ? row : null;
  if (actor.kind === "system") return null;
  return row;
}

export async function listAdminEvents(actor: Actor, source?: EventRows): Promise<Event[]> {
  requireAdmin(actor);
  return sorted(await rowsFrom(source));
}

export async function listEventAttendees(actor: Actor, eventIdInput: unknown) {
  requireAdmin(actor);
  const eventId = eventIdSchema.parse(eventIdInput);
  const db = await getDb();
  return db.select({profileId: eventRegistrations.profileId, displayName: profiles.displayName, email: profiles.email, status: eventRegistrations.status, checkedInAt: eventRegistrations.checkedInAt})
    .from(eventRegistrations).innerJoin(profiles, eq(profiles.id, eventRegistrations.profileId))
    .where(eq(eventRegistrations.eventId, eventId)).orderBy(asc(profiles.displayName), asc(eventRegistrations.profileId));
}

// ---------------------------------------------------------------------------
// Phase B1 (B-1): member-authored events. These go through raw SQL on the same
// `AutomationDatabase` seam the journeys repository uses, so a unit test can
// script the rows each statement returns without a database. Rows from
// `execute` arrive snake_case (`organiser_company_id`, `submitted_at`, …);
// callers map the fields they render explicitly and never hand a raw row to
// `localizeEvent`.
// ---------------------------------------------------------------------------

export type MemberEventDependencies = Readonly<{
  loadDatabase?: AutomationDatabaseLoader;
  getCompanyRole?: (actor: Actor, companyId: string) => Promise<CompanyRole | null>;
  now?: () => Date;
}>;

// A member never sets `published`/`memberOnly` or `status` directly: the
// status comes from which method they call and the booleans from the enums.
// `invite_only` is a staff-only visibility until the invitation flow exists.
const memberEventInputSchema = eventInputObjectSchema
  .omit({published: true, memberOnly: true, status: true})
  .extend({visibility: z.enum(["public", "members_only"]), heroMediaId: z.string().uuid().nullable()})
  .strict()
  .superRefine(addEventShapeIssues);

export type MemberEventInput = z.input<typeof memberEventInputSchema>;
export type MemberEventRow = Record<string, unknown>;

/** Neon returns `{rows}`; the in-memory executor in tests returns the array itself. */
function executedRows(result: unknown): MemberEventRow[] {
  if (Array.isArray(result)) return result as MemberEventRow[];
  if (result && typeof result === "object" && "rows" in result && Array.isArray(result.rows)) return result.rows as MemberEventRow[];
  return [];
}

async function memberDatabase(deps: MemberEventDependencies): Promise<AutomationDatabase> {
  return deps.loadDatabase ? deps.loadDatabase() : (await getDb() as unknown as AutomationDatabase);
}

function textArray(values: readonly string[]) {
  // drizzle expands a JS array inside `sql` into a `(a, b)` list, which is
  // not a Postgres array and is a syntax error when empty; build ARRAY[] instead.
  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

async function requireCompanyManager(actor: Actor, companyId: string, deps: MemberEventDependencies): Promise<Extract<Actor, {kind: "member"}>> {
  requireMember(actor);
  const role = await (deps.getCompanyRole ?? portalContentRepository.getCompanyRole)(actor, companyId);
  if (role !== "owner" && role !== "admin") throw new Error("FORBIDDEN");
  return actor;
}

async function upsertMemberEvent(actor: Extract<Actor, {kind: "member"}>, companyId: string, input: unknown, status: "draft" | "pending_review", deps: MemberEventDependencies): Promise<MemberEventRow> {
  const parsed = memberEventInputSchema.parse(input);
  const flags = derivedEventFlags({status, visibility: parsed.visibility});
  const now = (deps.now ?? (() => new Date()))();
  const company = eventIdSchema.parse(companyId);
  const database = await memberDatabase(deps);
  // One statement: insert, or update only a row this company organises that
  // may still move to `status`. A slug held by anyone else — another
  // organiser, an admin-authored event, or this company's own published or
  // cancelled event — yields no row, which the caller reports as taken.
  const row = executedRows(await database.execute(sql`
    INSERT INTO ${events}
      (slug, title_en, title_zh, description_en, description_zh, starts_at, ends_at, venue, capacity,
       member_only, published, hero_media_id, organiser_company_id, submitted_by_profile_id, submitted_at,
       status, visibility, format, online_url, registration_mode, external_registration_url, tags)
    VALUES
      (${parsed.slug}, ${parsed.titleEn}, ${parsed.titleZh ?? null}, ${parsed.descriptionEn}, ${parsed.descriptionZh ?? null},
       ${parsed.startsAt}, ${parsed.endsAt ?? null}, ${parsed.venue ?? null}, ${parsed.capacity ?? null},
       ${flags.memberOnly}, ${flags.published}, ${parsed.heroMediaId}, ${company}, ${actor.profileId},
       ${status === "pending_review" ? now : null}, ${status}, ${parsed.visibility}, ${parsed.format}, ${parsed.onlineUrl ?? null},
       ${parsed.registrationMode}, ${parsed.externalRegistrationUrl ?? null}, ${textArray(parsed.tags)})
    ON CONFLICT (slug) DO UPDATE SET
      title_en = EXCLUDED.title_en, title_zh = EXCLUDED.title_zh, description_en = EXCLUDED.description_en,
      description_zh = EXCLUDED.description_zh, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
      venue = EXCLUDED.venue, capacity = EXCLUDED.capacity, member_only = EXCLUDED.member_only,
      published = EXCLUDED.published, hero_media_id = EXCLUDED.hero_media_id,
      submitted_by_profile_id = EXCLUDED.submitted_by_profile_id,
      submitted_at = COALESCE(EXCLUDED.submitted_at, ${events.submittedAt}),
      status = EXCLUDED.status, visibility = EXCLUDED.visibility, format = EXCLUDED.format,
      online_url = EXCLUDED.online_url, registration_mode = EXCLUDED.registration_mode,
      external_registration_url = EXCLUDED.external_registration_url, tags = EXCLUDED.tags,
      reviewed_at = NULL, reviewed_by_profile_id = NULL, rejection_reason = NULL, updated_at = now()
    WHERE ${events.organiserCompanyId} = ${company} AND ${events.status} IN ('draft', 'rejected', 'pending_review')
    RETURNING *
  `))[0];
  if (!row) throw new Error("EVENT_SLUG_TAKEN");
  return row;
}

export async function saveMemberEventDraft(actor: Actor, companyId: string, input: unknown, deps: MemberEventDependencies = {}): Promise<MemberEventRow> {
  const member = await requireCompanyManager(actor, companyId, deps);
  return upsertMemberEvent(member, companyId, input, "draft", deps);
}

/** The caller supplies the plan and this quarter's count (`countCompanySubmissionsThisQuarter`); D-5 is asserted before any SQL. */
export async function submitMemberEvent(
  actor: Actor, companyId: string, input: unknown,
  deps: MemberEventDependencies & Readonly<{plan: MembershipPlanCode; usedThisQuarter: number}>,
): Promise<MemberEventRow> {
  const member = await requireCompanyManager(actor, companyId, deps);
  assertCanSubmitEvent(deps.plan, deps.usedThisQuarter);
  return upsertMemberEvent(member, companyId, input, "pending_review", deps);
}

export async function listCompanyEvents(actor: Actor, companyId: string, deps: MemberEventDependencies = {}): Promise<MemberEventRow[]> {
  await requireCompanyManager(actor, companyId, deps);
  const database = await memberDatabase(deps);
  return executedRows(await database.execute(sql`
    SELECT * FROM ${events} WHERE ${events.organiserCompanyId} = ${eventIdSchema.parse(companyId)}
    ORDER BY ${events.startsAt} DESC, ${events.slug} ASC
  `));
}

export async function getEventForMemberEdit(actor: Actor, eventId: string, deps: MemberEventDependencies = {}): Promise<MemberEventRow | null> {
  requireMember(actor);
  const id = eventIdSchema.parse(eventId);
  const database = await memberDatabase(deps);
  const row = executedRows(await database.execute(sql`SELECT * FROM ${events} WHERE ${events.id} = ${id}`))[0];
  if (!row) return null;
  // An admin-authored event has no organiser, so no member may edit it.
  const organiser = row.organiser_company_id ?? row.organiserCompanyId;
  if (typeof organiser !== "string") throw new Error("FORBIDDEN");
  await requireCompanyManager(actor, organiser, deps);
  return row;
}

/** S-4: submissions this Hong Kong calendar quarter that went past draft and were not rejected. */
export async function countCompanySubmissionsThisQuarter(actor: Actor, companyId: string, deps: MemberEventDependencies = {}): Promise<number> {
  await requireCompanyManager(actor, companyId, deps);
  const {start, end} = hongKongQuarterBounds((deps.now ?? (() => new Date()))());
  const database = await memberDatabase(deps);
  const row = executedRows(await database.execute(sql`
    SELECT count(*)::int AS count FROM ${events}
    WHERE ${events.organiserCompanyId} = ${eventIdSchema.parse(companyId)}
      AND ${events.submittedAt} >= ${start} AND ${events.submittedAt} < ${end}
      AND ${events.status} IN ('pending_review', 'published', 'cancelled')
  `))[0];
  return Number(row?.count ?? 0);
}

const reviewDecisionSchema = z.discriminatedUnion("decision", [
  z.object({decision: z.literal("approve")}).strict(),
  z.object({decision: z.literal("reject"), reason: z.string().trim().min(1).max(1_000)}).strict(),
]);

export type EventReviewDecision = z.input<typeof reviewDecisionSchema>;

export async function reviewEvent(actor: Actor, eventId: string, decision: unknown, deps: MemberEventDependencies = {}): Promise<MemberEventRow> {
  requireAdmin(actor);
  const id = eventIdSchema.parse(eventId);
  const parsed = reviewDecisionSchema.parse(decision);
  const database = await memberDatabase(deps);
  return database.transaction(async (transaction) => {
    const current = executedRows(await transaction.execute(sql`SELECT * FROM ${events} WHERE ${events.id} = ${id} FOR UPDATE`))[0];
    if (!current) throw new Error("EVENT_NOT_FOUND");
    const currentStatus = String(current.status) as EventStatus;
    const visibility = String(current.visibility ?? "public") as EventVisibility;
    const next: EventStatus = parsed.decision === "approve" ? "published" : "rejected";
    if (!canTransitionEvent(currentStatus, next)) throw new Error("INVALID_EVENT_TRANSITION");
    const flags = derivedEventFlags({status: next, visibility});
    const reason = parsed.decision === "reject" ? parsed.reason : null;
    const updated = executedRows(await transaction.execute(sql`
      UPDATE ${events}
      SET status = ${next}, published = ${flags.published}, member_only = ${flags.memberOnly},
          published_at = CASE WHEN ${next}::text = 'published' THEN COALESCE(${events.publishedAt}, now()) ELSE ${events.publishedAt} END,
          reviewed_at = now(), reviewed_by_profile_id = ${actor.profileId}, rejection_reason = ${reason}, updated_at = now()
      WHERE ${events.id} = ${id}
      RETURNING *
    `))[0];
    if (!updated) throw new Error("EVENT_NOT_FOUND");
    await transaction.execute(sql`
      INSERT INTO ${auditEvents} (actor_user_id, actor_type, action, target_type, target_id, metadata)
      VALUES (${actor.profileId}, ${actor.kind}, ${parsed.decision === "approve" ? "event.review.approved" : "event.review.rejected"}, 'event', ${id},
              ${JSON.stringify({slug: current.slug, organiserCompanyId: current.organiser_company_id ?? null, reason})}::jsonb)
    `);
    return updated;
  });
}

export async function listEventsForReview(actor: Actor, deps: MemberEventDependencies = {}): Promise<MemberEventRow[]> {
  requireAdmin(actor);
  const database = await memberDatabase(deps);
  return executedRows(await database.execute(sql`
    SELECT * FROM ${events} WHERE ${events.status} = 'pending_review'
    ORDER BY ${events.submittedAt} ASC NULLS LAST, ${events.slug} ASC
  `));
}

export const eventsRepository = {
  listPublic: listPublicEvents,
  countPublic: countPublicEvents,
  getPublicBySlug: getPublicEventBySlug,
  listFeaturedPublic: listFeaturedPublicEvents,
  listForMember: listMemberEvents,
  getBySlug: getEventBySlug,
  listForAdmin: listAdminEvents,
  create: createEvent,
  update: updateEvent,
  register: registerForEvent,
  listAttendees: listEventAttendees,
  saveMemberDraft: saveMemberEventDraft,
  submitMember: submitMemberEvent,
  listForCompany: listCompanyEvents,
  getForMemberEdit: getEventForMemberEdit,
  countCompanySubmissionsThisQuarter,
  review: reviewEvent,
  listForReview: listEventsForReview,
};
