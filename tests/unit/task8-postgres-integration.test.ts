import {isolatedAuditDatabase} from "../integration/audit-database-fixture";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

const database = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

import {checkInAttendee} from "@/lib/admin/events";
import {registerForEvent} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
async function psql(query: string): Promise<string> {
  const result = await fixture.pool.query({text: query, rowMode: "array"});
  if (Array.isArray(result)) return "";
  return result.rows.map(row => row.map((value: unknown) => value === null ? "" : String(value)).join("|")).join("\n");
}
const eventId = "11111111-1111-4111-8111-111111111111";
const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "staff-profile"};
const member = (profileId: string): Actor => ({kind: "member", userId: `auth-${profileId}`, profileId});

describe.skipIf(!enabled)("Task 8 event concurrency on isolated Postgres 16", () => {
  beforeAll(async () => {
    fixture = await isolatedAuditDatabase();
    await psql(`
      INSERT INTO profiles (id,auth_user_id,role,display_name,email) VALUES ('staff-profile','auth-staff','staff','Staff','staff@example.test'),('profile-a','auth-profile-a','member','A','a@example.test'),('profile-b','auth-profile-b','member','B','b@example.test');
      INSERT INTO memberships (owner_user_id,status,plan_code,seat_limit,billing_interval) VALUES ('profile-a','active','community',1,'none'),('profile-b','active','community',1,'none');
      INSERT INTO events (id, slug, title_en, description_en, starts_at, capacity, published, status) VALUES ('${eventId}','last-seat','Last seat','Capacity race','2099-09-01T10:00:00Z',1,true,'published');
    `);
    database.current = fixture.database;
  }, 90_000);
  afterAll(async () => {if (fixture) await fixture.close(); vi.useRealTimers();});

  it("does not oversubscribe the last seat and creates one attendance fact/audit under double check-in", async () => {
    const registrations = await Promise.all([registerForEvent(member("profile-a"), {eventId}), registerForEvent(member("profile-b"), {eventId})]);
    expect(registrations.map(({disposition}) => disposition).sort()).toEqual(["registered", "waitlist"]);
    expect((await psql("SELECT count(*) FILTER (WHERE status='registered') || '|' || count(*) FILTER (WHERE status='waitlist') FROM event_registrations;")).trim()).toBe("1|1");
    const profileId = (await psql("SELECT profile_id FROM event_registrations WHERE status='registered';")).trim();
    const checkIns = await Promise.all([checkInAttendee(staff, {eventId, profileId}), checkInAttendee(staff, {eventId, profileId})]);
    expect(checkIns.map(({disposition}) => disposition).sort()).toEqual(["already_checked_in", "checked_in"]);
    expect((await psql(`SELECT (SELECT count(*) FROM engagement_events WHERE type='event_attended'), (SELECT count(*) FROM audit_events WHERE action='event.attendee.checked_in');`)).trim()).toBe("1|1");
  }, 30_000);
});
