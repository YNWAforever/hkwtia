import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createApplicationCasesRepository } from "@/lib/db/repos/applications";
import type { Database } from "@/lib/db/repos/common";
import { encodeScopedCursor } from "@/lib/admin/pagination";
import {
  listEventAttendeePage,
  listEventAttendeesForExport,
} from "@/lib/db/repos/events";
import { isolatedAuditDatabase } from "./audit-database-fixture";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const staffA = {
  kind: "staff" as const,
  userId: "admin-workflow-staff-a",
  profileId: "admin-workflow-staff-a",
};
const staffB = {
  kind: "staff" as const,
  userId: "admin-workflow-staff-b",
  profileId: "admin-workflow-staff-b",
};
const member = {
  kind: "member" as const,
  userId: "admin-workflow-member",
  profileId: "admin-workflow-member",
};
const applicationId = randomUUID();
const companyId = randomUUID();
const membershipId = randomUUID();
const eventId = randomUUID();
const otherEventId = randomUUID();

let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;

describe.skipIf(!enabled)("isolated admin workflow acceptance", () => {
  beforeAll(async () => {
    fixture = await isolatedAuditDatabase();
    await fixture.pool.query(
      `INSERT INTO profiles
        (id, auth_user_id, email, display_name, role, locale)
       VALUES
        ($1,$1,'staff-a@example.test','Synthetic Staff A','staff','en'),
        ($2,$2,'staff-b@example.test','Synthetic Staff B','staff','en'),
        ($3,$3,'member@example.test','Synthetic Applicant','member','en'),
        ('admin-workflow-attendee-a','admin-workflow-attendee-a',
         'attendee-a@example.test','Ada Member','member','en'),
        ('admin-workflow-attendee-b','admin-workflow-attendee-b',
         'attendee-b@example.test','Bea Member','member','en')`,
      [staffA.profileId, staffB.profileId, member.profileId],
    );
    await fixture.pool.query(
      `INSERT INTO companies (id, legal_name, display_name, website, industry, size_band, description)
       VALUES ($1,'Synthetic Company Limited','Synthetic Brand',
         'https://synthetic.example.test','Technology','small',
         'Synthetic company description')`,
      [companyId],
    );
    await fixture.pool.query(
      `INSERT INTO membership_applications
        (id, applicant_user_id, company_id, plan_code, status, current_step)
       VALUES ($1,$2,$3,'startup','pending_review','review')`,
      [applicationId, member.profileId, companyId],
    );
    await fixture.pool.query(
      `INSERT INTO memberships
        (id, company_id, application_id, plan_code, status, seat_limit)
       VALUES ($1,$2,$3,'startup','pending_review',3)`,
      [membershipId, companyId, applicationId],
    );
    await fixture.pool.query(
      `INSERT INTO events
        (id, slug, title_en, description_en, starts_at, published, status)
       VALUES
        ($1,'admin-workflow-event','Synthetic Target Event',
         'Synthetic event','2030-12-31T10:00:00Z',true,'published'),
        ($2,'admin-workflow-other','Synthetic Other Event',
         'Synthetic other event','2030-12-31T10:00:00Z',true,'published')`,
      [eventId, otherEventId],
    );
    await fixture.pool.query(
      `INSERT INTO event_registrations (event_id, profile_id, status)
       VALUES
        ($1,'admin-workflow-attendee-a','registered'),
        ($1,'admin-workflow-attendee-b','registered')`,
      [eventId],
    );
    await fixture.pool.query(
      `INSERT INTO event_guest_registrations
        (id, event_id, name, email, organisation, status,
         cancel_token_digest, idempotency_key)
       VALUES
        ($1,$2,'Ada Guest','ada.guest@example.test','Synthetic Org',
         'waitlist','admin-workflow-guest-a','admin-workflow-guest-a'),
        ($3,$4,'Ada Other Event','ada.other@example.test',NULL,
         'registered','admin-workflow-guest-b','admin-workflow-guest-b')`,
      [randomUUID(), eventId, randomUUID(), otherEventId],
    );
  }, 180_000);

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it("serializes one application review and records the acting staff for each committed update", async () => {
    const repo = createApplicationCasesRepository(
      async () => fixture.database as unknown as Database,
    );
    const attempts = await Promise.allSettled([
      repo.updateApplicationCase(staffA, applicationId, {
        expectedVersion: "0",
        nextActionCode: "await_documents",
        missingFields: ["companyWebsite"],
        note: "Synthetic administrator A follow-up",
      }),
      repo.updateApplicationCase(staffB, applicationId, {
        expectedVersion: "0",
        nextActionCode: "contact_applicant",
        note: "Synthetic administrator B follow-up",
      }),
    ]);
    expect(attempts.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(
      (result) => result.status === "rejected",
    ) as PromiseRejectedResult;
    expect(rejected.reason.message).toBe("APPLICATION_CASE_VERSION_CONFLICT");

    const firstRead = await repo.getApplicationCase(staffA, applicationId);
    expect(firstRead?.timeline).toHaveLength(1);
    expect(firstRead?.timeline[0]?.actorName).toMatch(/Synthetic Staff [AB]/);
    expect(firstRead?.profile).toMatchObject({
      email: "member@example.test",
    });
    expect(firstRead?.company).toMatchObject({
      legalName: "Synthetic Company Limited",
      displayName: "Synthetic Brand",
      website: "https://synthetic.example.test",
    });

    await expect(
      repo.updateApplicationCase(staffB, applicationId, {
        expectedVersion: "0",
        note: "Synthetic stale retry",
      }),
    ).rejects.toThrow("APPLICATION_CASE_VERSION_CONFLICT");
    await repo.updateApplicationCase(staffB, applicationId, {
      expectedVersion: firstRead!.version,
      nextActionCode: "review_ready",
      note: "Synthetic second administrator decision",
    });
    const secondRead = await repo.getApplicationCase(staffB, applicationId);
    expect(secondRead?.timeline).toHaveLength(2);
    expect(secondRead?.timeline[0]?.actorName).toBe("Synthetic Staff B");

    expect(
      (
        await fixture.pool.query(
          `SELECT status FROM membership_applications WHERE id=$1`,
          [applicationId],
        )
      ).rows,
    ).toEqual([{status: "pending_review"}]);
    expect(
      (
        await fixture.pool.query(
          `SELECT status FROM memberships WHERE id=$1`,
          [membershipId],
        )
      ).rows,
    ).toEqual([{status: "pending_review"}]);
  }, 40_000);

  it("keeps attendee total, search, pagination and export on the same event-scoped rows", async () => {
    const first = await listEventAttendeePage(
      staffA,
      eventId,
      {search: "Ada", limit: 1, cursor: null},
      {loadDatabase: async () => fixture.database},
    );
    expect(first?.totalMatching).toBe(2);
    expect(first?.items).toHaveLength(1);
    expect(first?.nextCursor).toBeTruthy();
    const second = await listEventAttendeePage(
      staffA,
      eventId,
      {search: "Ada", limit: 1, cursor: first!.nextCursor},
      {loadDatabase: async () => fixture.database},
    );
    expect(second?.totalMatching).toBe(2);
    expect(
      new Set([...first!.items, ...second!.items].map((row) =>
        `${row.kind}:${row.profileId ?? row.guestId}`,
      )).size,
    ).toBe(2);
    const stale = encodeScopedCursor(`event:${eventId}:attendees:ada`, [
      "zzzz",
      "ticket",
      "zzzz",
    ]);
    const stalePage = await listEventAttendeePage(
      staffA,
      eventId,
      {search: "Ada", limit: 1, cursor: stale},
      {loadDatabase: async () => fixture.database},
    );
    expect(stalePage?.items).toEqual([]);
    expect(stalePage?.totalMatching).toBe(2);

    const exported = await listEventAttendeesForExport(
      staffA,
      eventId,
      "Ada",
      {loadDatabase: async () => fixture.database},
    );
    expect(exported).toHaveLength(2);
    expect(
      exported?.every((row) =>
        [row.displayName, row.email, row.organisation]
          .some((value) => value?.toLowerCase().includes("ada")),
      ),
    ).toBe(true);
    expect(
      exported?.some((row) => row.email === "ada.other@example.test"),
    ).toBe(false);

    await expect(
      listEventAttendeePage(
        member,
        eventId,
        {search: "", limit: 20, cursor: null},
        {loadDatabase: async () => fixture.database},
      ),
    ).rejects.toThrow("FORBIDDEN");
  }, 40_000);
});
