import {describe, expect, it, vi} from "vitest";

import {
  countCompanySubmissionsThisQuarter,
  getEventForMemberEdit,
  listCompanyEvents,
  listEventsForReview,
  reviewEvent,
  saveMemberEventDraft,
  submitMemberEvent,
} from "@/lib/db/repos/events";
import type {Actor, CompanyRole} from "@/lib/membership/lifecycle";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const EVENT = "22222222-2222-4222-8222-222222222222";
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

function fakeDeps(rows: Record<string, unknown>[][] = [[]]) {
  const queue = [...rows];
  const execute = vi.fn(async () => queue.shift() ?? []);
  const database = {execute, transaction: async <T,>(work: (tx: {execute: typeof execute}) => Promise<T>) => work({execute})};
  return {execute, deps: {loadDatabase: async () => database as never, getCompanyRole: roles}};
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

  it("saves a draft and returns the row", async () => {
    const {execute, deps} = fakeDeps([[{id: EVENT, slug: "ai-clinic-2026", status: "draft", published: false, member_only: false}]]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps)).resolves.toMatchObject({id: EVENT, status: "draft"});
    expect(execute).toHaveBeenCalledTimes(1);
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
    const {deps} = fakeDeps([[{id: EVENT, status: "pending_review", published: false, member_only: false}]]);
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 1})).resolves.toMatchObject({status: "pending_review"});
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "startup", usedThisQuarter: 2})).rejects.toThrow("EVENT_QUOTA_EXCEEDED");
    await expect(submitMemberEvent(member, COMPANY, input, {...deps, plan: "community", usedThisQuarter: 0})).rejects.toThrow("EVENT_PUBLISHING_NOT_INCLUDED");
  });

  it("reports a slug collision instead of silently updating another organiser's event", async () => {
    const {deps} = fakeDeps([[]]);
    await expect(saveMemberEventDraft(member, COMPANY, input, deps)).rejects.toThrow("EVENT_SLUG_TAKEN");
  });

  it("reviews only from pending_review and audits in the same transaction", async () => {
    const pending = {id: EVENT, slug: "ai-clinic-2026", status: "pending_review", visibility: "public", organiser_company_id: COMPANY};
    const {execute, deps} = fakeDeps([[pending], [{...pending, status: "published", published: true}], []]);
    await expect(reviewEvent(staff, EVENT, {decision: "approve"}, deps)).resolves.toMatchObject({status: "published"});
    expect(execute).toHaveBeenCalledTimes(3);
    const rejected = fakeDeps([[{...pending, status: "draft"}]]);
    await expect(reviewEvent(staff, EVENT, {decision: "reject", reason: "duplicate"}, rejected.deps)).rejects.toThrow("INVALID_EVENT_TRANSITION");
    expect(rejected.execute).toHaveBeenCalledTimes(1);
    await expect(reviewEvent(member, EVENT, {decision: "approve"}, deps)).rejects.toThrow();
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
    const edit = fakeDeps([[{id: EVENT, organiser_company_id: COMPANY, status: "draft"}]]);
    await expect(getEventForMemberEdit(outsider, EVENT, edit.deps)).rejects.toThrow("FORBIDDEN");
    const own = fakeDeps([[{id: EVENT, organiser_company_id: COMPANY, status: "draft"}]]);
    await expect(getEventForMemberEdit(member, EVENT, own.deps)).resolves.toMatchObject({id: EVENT});
    await expect(getEventForMemberEdit(member, EVENT, fakeDeps([[]]).deps)).resolves.toBeNull();
    await expect(getEventForMemberEdit(member, EVENT, fakeDeps([[{id: EVENT, organiser_company_id: null, status: "published"}]]).deps)).rejects.toThrow("FORBIDDEN");
  });

  it("lists the review queue for staff only", async () => {
    const {execute, deps} = fakeDeps([[{id: EVENT, status: "pending_review"}]]);
    await expect(listEventsForReview(member, deps)).rejects.toThrow("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
    await expect(listEventsForReview(staff, deps)).resolves.toMatchObject([{id: EVENT, status: "pending_review"}]);
  });
});
