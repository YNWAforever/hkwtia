import "server-only";

import {and, asc, count, eq, gte, inArray, isNull, or} from "drizzle-orm";
import {z} from "zod";

import {requireAdmin} from "@/lib/auth/authorize";
import {getDb} from "@/lib/db/repos/common";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import {auditEvents, companyMembers, eventRegistrations, events, memberships, profiles, type Event} from "@/lib/db/server-schema";
import {requireMember, type Actor, type AdminActor} from "@/lib/membership/lifecycle";

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
}).strict();
const eventInputSchema = eventInputObjectSchema.superRefine((input, context) => {
  if (input.endsAt && input.endsAt <= input.startsAt) context.addIssue({code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt"});
});
const eventUpdateSchema = eventInputObjectSchema.partial().superRefine((input, context) => {
  if (Object.keys(input).length === 0) context.addIssue({code: z.ZodIssueCode.custom, message: "event update is empty"});
  if (input.startsAt && input.endsAt && input.endsAt <= input.startsAt) context.addIssue({code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt"});
});
const eventPeriodSchema = z.object({startsAt: z.coerce.date(), endsAt: z.coerce.date().nullable()}).superRefine((input, context) => {
  if (input.endsAt && input.endsAt <= input.startsAt) context.addIssue({code: z.ZodIssueCode.custom, path: ["endsAt"], message: "endsAt must be after startsAt"});
});
const registrationInputSchema = z.object({eventId: eventIdSchema}).strict();

type StoredEventInput = z.output<typeof eventInputSchema>;
type StoredEventUpdate = z.output<typeof eventUpdateSchema>;
type EventAudit = Readonly<{
  actorUserId: string;
  actorType: AdminActor["kind"] | "member";
  action: "event.created" | "event.updated" | "event.registration.created";
  targetType: "event";
  targetId: string;
  metadata: Record<string, unknown>;
}>;

export type EventRows = readonly Event[] | Readonly<{list: () => Promise<readonly Event[]>}>;
export type FeaturedPublicEventOptions = Readonly<{asOf: Date; limit: number}>;
export type MemberEventEligibility = Readonly<{hasEligibleMembership: (actor: Extract<Actor, {kind: "member"}>) => Promise<boolean>}>;
export type EventMutationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  insertEvent: (input: StoredEventInput) => Promise<Event>;
  lockEvent: (id: string) => Promise<Event | null>;
  updateEvent: (id: string, input: StoredEventUpdate) => Promise<Event | null>;
  insertAudit: (input: EventAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;
export type RegistrationStatus = "registered" | "waitlist" | "cancelled" | "attended" | "no_show";
export type EventRegistrationDependencies = Readonly<{transaction: <T>(work: (transaction: Readonly<{
  lockEvent: (eventId: string) => Promise<Readonly<{id: string; capacity: number | null; published: boolean}> | null>;
  hasEligibleMembership: (profileId: string) => Promise<boolean>;
  getRegistration: (eventId: string, profileId: string) => Promise<Readonly<{status: RegistrationStatus}> | null>;
  countRegistered: (eventId: string) => Promise<number>;
  upsertRegistration: (eventId: string, profileId: string, status: "registered" | "waitlist") => Promise<void>;
  insertAudit: (input: EventAudit) => Promise<void>;
}>) => Promise<T>) => Promise<T>}>;

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

export async function listPublicEvents(_actor: Actor, source?: EventRows): Promise<Event[]> {
  return sorted((await rowsFrom(source)).filter((event) => event.published && !event.memberOnly));
}

export async function listFeaturedPublicEvents(
  _actor: Actor,
  options: FeaturedPublicEventOptions,
  source?: EventRows,
): Promise<Event[]> {
  const limit = publicReadLimitSchema.parse(options.limit);
  const asOf = z.coerce.date().parse(options.asOf);
  if (source) {
    return sorted(await rowsFrom(source))
      .filter((event) => event.published && !event.memberOnly && event.startsAt >= asOf)
      .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime() || left.slug.localeCompare(right.slug))
      .slice(0, limit);
  }
  const database = await getDb();
  return database.select().from(events)
    .where(and(
      eq(events.published, true),
      eq(events.memberOnly, false),
      gte(events.startsAt, asOf),
    ))
    .orderBy(asc(events.startsAt), asc(events.slug))
    .limit(limit);
}

const eligibleStatuses = ["active", "past_due", "cancel_at_period_end"] as const;
const defaultMemberEligibility: MemberEventEligibility = {hasEligibleMembership: async (actor) => (await membershipsRepository.list(actor)).some((membership) => (eligibleStatuses as readonly string[]).includes(membership.status))};

export async function listMemberEvents(actor: Actor, source?: EventRows, eligibility: MemberEventEligibility = defaultMemberEligibility): Promise<Event[]> {
  requireMember(actor);
  if (!await eligibility.hasEligibleMembership(actor)) throw new Error("MEMBERSHIP_INACTIVE");
  return sorted((await rowsFrom(source)).filter((event) => event.published));
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
    insertAudit: async (input) => { await tx.insert(auditEvents).values(input); },
  }))};
}

export async function createEvent(actor: Actor, input: unknown, dependencies?: EventMutationDependencies): Promise<Event> {
  requireAdmin(actor);
  const parsed = eventInputSchema.parse(input);
  return (dependencies ?? await defaultMutationDependencies()).transaction(async (transaction) => {
    const event = await transaction.insertEvent(parsed);
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
    const event = await transaction.updateEvent(eventId, parsed);
    if (!event) return null;
    await transaction.insertAudit({actorUserId: actor.profileId, actorType: actor.kind, action: "event.updated", targetType: "event", targetId: event.id, metadata: {fields: Object.keys(parsed).sort()}});
    return event;
  });
}

async function defaultRegistrationDependencies(): Promise<EventRegistrationDependencies> {
  const db = await getDb();
  return {transaction: (work) => db.transaction(async (tx) => work({
    lockEvent: async (eventId) => (await tx.select({id: events.id, capacity: events.capacity, published: events.published}).from(events).where(eq(events.id, eventId)).for("update"))[0] ?? null,
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
  return (dependencies ?? await defaultRegistrationDependencies()).transaction(async (transaction) => {
    const event = await transaction.lockEvent(eventId);
    if (!event || !event.published) throw new Error("EVENT_NOT_FOUND");
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
  if (actor.kind === "anonymous") return row.published && !row.memberOnly ? row : null;
  if (actor.kind === "member") return row.published ? row : null;
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

export const eventsRepository = {
  listPublic: listPublicEvents,
  listFeaturedPublic: listFeaturedPublicEvents,
  listForMember: listMemberEvents,
  getBySlug: getEventBySlug,
  listForAdmin: listAdminEvents,
  create: createEvent,
  update: updateEvent,
  register: registerForEvent,
  listAttendees: listEventAttendees,
};
