import {describe, expect, it, vi} from "vitest";

import {
  countCompanySubmissionsThisQuarter,
  getEventForMemberEdit,
  listCompanyEvents,
  listEventsForReview,
  reviewEvent,
  saveMemberEventDraft,
  submitMemberEvent,
  type MemberEventRow,
} from "@/lib/db/repos/events";
import type {Actor, CompanyRole} from "@/lib/membership/lifecycle";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
const HERO = "33333333-3333-4333-8333-333333333333";
const member: Actor = {kind: "member", userId: "u", profileId: "member-1"};
const outsider: Actor = {kind: "member", userId: "u2", profileId: "member-2"};
const staff: Actor = {kind: "staff", userId: "s", profileId: "staff-1"};
const roles = async (actor: Actor): Promise<CompanyRole | null> => ("profileId" in actor && actor.profileId === "member-1" ? "admin" : null);

const input = {
  slug: "ai-clinic-2026", titleEn: "AI Clinic", titleZh: null, descriptionEn: "Hands-on session", descriptionZh: null,
  startsAt: new Date("2030-03-01T02:00:00Z"), endsAt: new Date("2030-03-01T04:00:00Z"), venue: "KOHO", capacity: 40,
  format: "in_person" as const, onlineUrl: null, visibility: "public" as const, registrationMode: "rsvp" as const,
  externalRegistrationUrl: null, tags: ["ai"], heroMediaId: null,
};

/** A full snake_case row as `SELECT * FROM events` returns it; the repository parses every read. */
function row(overrides: Partial<MemberEventRow> = {}): MemberEventRow {
  return {
    id: EVENT, slug: "ai-clinic-2026", title_en: "AI Clinic", title_zh: null, description_en: "Hands-on session", description_zh: null,
    starts_at: new Date("2030-03-01T02:00:00Z"), ends_at: new Date("2030-03-01T04:00:00Z"), venue: "KOHO", capacity: 40,
    status: "draft", visibility: "public", format: "in_person", online_url: null, registration_mode: "rsvp", external_registration_url: null,
    tags: ["ai"], hero_media_id: null, organiser_company_id: COMPANY, submitted_by_profile_id: "member-1",
    submitted_at: null, published_at: null, reviewed_at: null, rejection_reason: null,
    published: false, member_only: false,
    ...overrides,
  };
}

/** Each queue entry is what the next `execute` returns, or an Error it rejects with. */
function fakeDeps(queue: (Record<string, unknown>[] | Error)[] = [[]]) {
  const pending = [...queue];
  const execute = vi.fn<(query: unknown) => Promise<Record<string, unknown>[]>>(async () => {
    const next = pending.shift() ?? [];
    if (next instanceof Error) throw next;
    return next;
  });
  const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
  return {execute, deps: {loadDatabase: async () => database as never, getCompanyRole: roles}};
}

function uniqueViolation(): Error {
  return Object.assign(new Error("duplicate key value violates unique constraint \"events_slug_unique\""), {code: "23505", constraint: "events_slug_unique"});
}

/** The literal SQL text of a drizzle `sql` object: its string chunks, nested templates included, without parameters or identifiers. */
function literalText(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return "";
  if ("queryChunks" in chunk && Array.isArray(chunk.queryChunks)) return chunk.queryChunks.map(literalText).join("");
  if ("value" in chunk && Array.isArray(chunk.value)) return chunk.value.join("");
  return "";
}

function statementText(execute: ReturnType<typeof fakeDeps>["execute"], call: number): string {
  return literalText(execute.mock.calls[call]?.[0]);
}

describe("member event writes (programme B-1)", () => {
  it("refuses a member without a manager role on the organiser company before any SQL", async () => {
    const {execute, deps} = fakeDeps();
    await expect(saveMemberEventDraft(outsider, COMPANY, input, deps)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses anyone who is not a member before consulting company roles", async () => {
    const getCompanyRole = vi.fn(roles);
    const {execute, deps} = fakeDeps();
    await expect(saveMemberEventDraft(staff, COMPANY, input, {...deps, getCompanyRole})).rejects.toThrow("FORBIDDEN");
    expect(getCompanyRole).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("saves a new draft with a single INSERT and returns the typed row", async () => {
    const {execute, deps} = fakeDeps([[row()]]);
    const saved = await saveMemberEventDraft(member, COMPANY, input, deps);
    expect(saved).toMatchObject({id: EVENT, status: "draft", organiser_company_id: COMPANY});
    expect(saved.starts_at).toBeInstanceOf(Date);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(statementText(execute, 0)).toContain("INSERT INTO");
    expect(statementText(execute, 0)).not.toContain("ON CONFLICT");
  });

  it("rejects a row the database returns in an unexpected shape instead of rendering it", async () => {
    const {deps} = fakeDeps([[{id: EVENT, status: "draft"}]]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps)).rejects.toThrow();
  });

  it("rejects online events without a URL and external registration without a link before any SQL", async () => {
    const {execute, deps} = fakeDeps();
    await expect(saveMemberEventDraft(member, COMPANY, {...input, format: "online"}, deps)).rejects.toThrow("onlineUrl is required");
    await expect(saveMemberEventDraft(member, COMPANY, {...input, registrationMode: "external"}, deps)).rejects.toThrow("externalRegistrationUrl is required");
    await expect(saveMemberEventDraft(member, COMPANY, {...input, visibility: "invite_only"}, deps)).rejects.toThrow();
    await expect(saveMemberEventDraft(member, COMPANY, {...input, published: true}, deps)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });

  it("submits for review only inside the quota", async () => {
    const {deps} = fakeDeps([[row({status: "pending_review", submitted_at: new Date("2026-09-09T00:00:00Z")})]]);
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 1})).resolves.toMatchObject({status: "pending_review"});
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 2})).rejects.toThrow("EVENT_QUOTA_EXCEEDED");
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "community", usedThisQuarter: 0})).rejects.toThrow("EVENT_PUBLISHING_NOT_INCLUDED");
  });

  it("maps a slug unique violation on insert to EVENT_SLUG_TAKEN", async () => {
    const {deps} = fakeDeps([uniqueViolation()]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps)).rejects.toThrow("EVENT_SLUG_TAKEN");
    const wrapped = fakeDeps([Object.assign(new Error("query failed"), {cause: uniqueViolation()})]);
    await expect(saveMemberEventDraft(member, COMPANY, input, wrapped.deps)).rejects.toThrow("EVENT_SLUG_TAKEN");
    const other = fakeDeps([Object.assign(new Error("connection reset"), {code: "57P01"})]);
    await expect(saveMemberEventDraft(member, COMPANY, input, other.deps)).rejects.toThrow("connection reset");
  });

  it("edits by id, so a slug change updates the owned row instead of inserting a second one", async () => {
    const {execute, deps} = fakeDeps([[row({slug: "ai-clinic-2026-renamed"})]]);
    const saved = await saveMemberEventDraft(member, COMPANY, {...input, slug: "ai-clinic-2026-renamed"}, deps, EVENT);
    expect(saved).toMatchObject({id: EVENT, slug: "ai-clinic-2026-renamed"});
    expect(execute).toHaveBeenCalledTimes(1);
    expect(statementText(execute, 0)).toContain("UPDATE");
    expect(statementText(execute, 0)).not.toContain("INSERT INTO");
  });

  it("maps a slug unique violation on update to EVENT_SLUG_TAKEN", async () => {
    const {deps} = fakeDeps([uniqueViolation()]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps, EVENT)).rejects.toThrow("EVENT_SLUG_TAKEN");
  });

  it("reports an owned but published row as not editable", async () => {
    const {execute, deps} = fakeDeps([[], [{status: "published"}]]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps, EVENT)).rejects.toThrow("EVENT_NOT_EDITABLE");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("reports another organiser's id as forbidden", async () => {
    const {execute, deps} = fakeDeps([[], []]);
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 0}, EVENT)).rejects.toThrow("FORBIDDEN");
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("refuses an archived hero and checks the asset before writing", async () => {
    const archived = fakeDeps([[{id: HERO, archived_at: new Date("2026-01-01T00:00:00Z"), registered_by_profile_id: "member-1"}]]);
    await expect(saveMemberEventDraft(member, COMPANY, {...input, heroMediaId: HERO}, archived.deps)).rejects.toThrow("EVENT_HERO_MEDIA_INVALID");
    expect(archived.execute).toHaveBeenCalledTimes(1);
    const missing = fakeDeps([[]]);
    await expect(saveMemberEventDraft(member, COMPANY, {...input, heroMediaId: HERO}, missing.deps)).rejects.toThrow("EVENT_HERO_MEDIA_INVALID");
    const active = fakeDeps([[{id: HERO, archived_at: null, registered_by_profile_id: "member-1"}], [row({hero_media_id: HERO})]]);
    await expect(saveMemberEventDraft(member, COMPANY, {...input, heroMediaId: HERO}, active.deps)).resolves.toMatchObject({hero_media_id: HERO});
    expect(active.execute).toHaveBeenCalledTimes(2);
  });

  it("refuses a hero another profile uploaded, in the same locked read (S-3)", async () => {
    // Staff-registered (admin upload) and other members' rows both fail: the
    // member may only attach media whose registered_by_profile_id is theirs.
    const foreign = fakeDeps([[{id: HERO, archived_at: null, registered_by_profile_id: "staff-1"}]]);
    await expect(saveMemberEventDraft(member, COMPANY, {...input, heroMediaId: HERO}, foreign.deps)).rejects.toThrow("EVENT_HERO_MEDIA_INVALID");
    expect(foreign.execute).toHaveBeenCalledTimes(1);
    expect(literalText(foreign.execute.mock.calls[0]?.[0])).toContain("FOR UPDATE");
    const unstamped = fakeDeps([[{id: HERO, archived_at: null, registered_by_profile_id: null}]]);
    await expect(saveMemberEventDraft(member, COMPANY, {...input, heroMediaId: HERO}, unstamped.deps)).rejects.toThrow("EVENT_HERO_MEDIA_INVALID");
  });

  it("reviews only from pending_review and audits in the same transaction", async () => {
    const pending = row({status: "pending_review", submitted_at: new Date("2026-09-01T00:00:00Z")});
    const {execute, deps} = fakeDeps([[pending], [{...pending, status: "published", published: true, published_at: new Date()}], []]);
    await expect(reviewEvent(staff, EVENT, {decision: "approve"}, deps)).resolves.toMatchObject({status: "published"});
    expect(execute).toHaveBeenCalledTimes(3);
    expect(statementText(execute, 0)).toContain("FOR UPDATE");
    expect(statementText(execute, 1)).toContain("COALESCE");
    const rejected = fakeDeps([[{...pending, status: "draft"}]]);
    await expect(reviewEvent(staff, EVENT, {decision: "reject", reason: "duplicate"}, rejected.deps)).rejects.toThrow("INVALID_EVENT_TRANSITION");
    expect(rejected.execute).toHaveBeenCalledTimes(1);
    await expect(reviewEvent(member, EVENT, {decision: "approve"}, deps)).rejects.toThrow();
  });

  it("leaves published_at alone on rejection", async () => {
    const pending = row({status: "pending_review"});
    const {execute, deps} = fakeDeps([[pending], [{...pending, status: "rejected", rejection_reason: "duplicate"}], []]);
    await expect(reviewEvent(staff, EVENT, {decision: "reject", reason: "duplicate"}, deps)).resolves.toMatchObject({status: "rejected"});
    expect(statementText(execute, 1)).not.toContain("COALESCE");
  });

  it("requires a reason to reject and an existing row to review", async () => {
    const {deps} = fakeDeps([[]]);
    await expect(reviewEvent(staff, EVENT, {decision: "reject"}, deps)).rejects.toThrow();
    await expect(reviewEvent(staff, EVENT, {decision: "approve"}, fakeDeps([[]]).deps)).rejects.toThrow("EVENT_NOT_FOUND");
  });

  it("scopes company listings and edits to managers and counts the quarter", async () => {
    const {execute, deps} = fakeDeps([[{count: 2}]]);
    await expect(listCompanyEvents(outsider, COMPANY, deps)).rejects.toThrow("FORBIDDEN");
    await expect(countCompanySubmissionsThisQuarter(member, COMPANY, {...deps, now: () => new Date("2026-09-09T00:00:00Z")})).resolves.toBe(2);
    expect(execute).toHaveBeenCalledTimes(1);
    await expect(listCompanyEvents(member, COMPANY, fakeDeps([[row()]]).deps)).resolves.toMatchObject([{id: EVENT}]);
    const edit = fakeDeps([[row()]]);
    await expect(getEventForMemberEdit(outsider, EVENT, edit.deps)).rejects.toThrow("FORBIDDEN");
    const own = fakeDeps([[row()]]);
    await expect(getEventForMemberEdit(member, EVENT, own.deps)).resolves.toMatchObject({id: EVENT});
    await expect(getEventForMemberEdit(member, EVENT, fakeDeps([[]]).deps)).resolves.toBeNull();
    await expect(getEventForMemberEdit(member, EVENT, fakeDeps([[row({organiser_company_id: null, status: "published"})]]).deps)).rejects.toThrow("FORBIDDEN");
  });

  it("lists the review queue for staff only, with the organiser's display name joined in", async () => {
    const {execute, deps} = fakeDeps([[{...row({status: "pending_review"}), organiser_name: "Acme Robotics"}]]);
    await expect(listEventsForReview(member, deps)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
    await expect(listEventsForReview(staff, deps)).resolves.toMatchObject([{id: EVENT, status: "pending_review", organiser_name: "Acme Robotics"}]);
    const statement = statementText(execute, 0);
    expect(statement).toContain("pending_review");
    // An admin-authored event has no organiser; the join must not drop it.
    const orphan = fakeDeps([[{...row({status: "pending_review", organiser_company_id: null}), organiser_name: null}]]);
    await expect(listEventsForReview(staff, orphan.deps)).resolves.toMatchObject([{id: EVENT, organiser_name: null}]);
  });
});
