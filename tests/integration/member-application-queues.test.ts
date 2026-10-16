import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";
import {isolatedBatchDatabase} from "./admin-batch-fixture";
const state = vi.hoisted(() => ({database: null as unknown}));
vi.mock("@/lib/db/repos/common", async (original) => ({...await original<typeof import("@/lib/db/repos/common")>(), getDb: async () => state.database}));
import {adminMembersRepository} from "@/lib/db/repos/admin-members";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const actor = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const ids = {draft: randomUUID(), draft2: randomUUID(), payment: randomUUID(), review: randomUUID(), done: randomUUID(), oldAttempt: randomUUID(), activeAttempt: randomUUID()};
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("application and payment operation queues", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase(); state.database = fixture.database;
    await fixture.pool.query(`
      ALTER TABLE memberships ADD COLUMN application_id uuid;
      CREATE TABLE membership_applications (id uuid PRIMARY KEY, applicant_user_id text NOT NULL,
        company_id uuid, plan_code text NOT NULL, current_step text NOT NULL, status text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE billing_attempts (id uuid PRIMARY KEY, membership_id uuid, attempt_number integer,
        state text, updated_at timestamptz NOT NULL DEFAULT now());
    `);
    await fixture.pool.query(`INSERT INTO membership_applications (id,applicant_user_id,plan_code,current_step,status) VALUES
      ($1,'a','startup','company','draft'),($2,'a','corporate','profile','draft'),
      ($3,'a','startup','checkout','pending_payment'),($4,'b','patron','review','pending_review'),
      ($5,'grant-c','community','complete','completed')`, [ids.draft, ids.draft2, ids.payment, ids.review, ids.done]);
    await fixture.pool.query("UPDATE memberships SET application_id=$1,status='pending_payment' WHERE owner_user_id='a'", [ids.payment]);
    await fixture.pool.query("UPDATE memberships SET application_id=$1,status='pending_review' WHERE owner_user_id='b'", [ids.review]);
    await fixture.pool.query("INSERT INTO billing_attempts (id,membership_id,attempt_number,state) VALUES ($1,'11111111-1111-4111-8111-111111111111',1,'expired'),($2,'11111111-1111-4111-8111-111111111111',2,'active')", [ids.oldAttempt, ids.activeAttempt]);
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();}, 40_000);

  it("keeps each application distinct, paginates tied timestamps, and scopes the cursor to the queue", async () => {
    const first = await adminMembersRepository.getApplicationQueuePage(actor, {status: "draft", limit: 1});
    expect(first.items).toHaveLength(1);
    expect(first.items[0]?.profileId).toBe("a");
    expect(first.items[0]?.applicationId).not.toBe("a");
    expect(first.nextCursor).not.toBeNull();
    const next = await adminMembersRepository.getApplicationQueuePage(actor, {status: "draft", limit: 1, cursor: first.nextCursor});
    expect(new Set([...first.items, ...next.items].map((row) => row.applicationId))).toEqual(new Set([ids.draft, ids.draft2]));
    expect(next.nextCursor).toBeNull();
    await expect(adminMembersRepository.getApplicationQueuePage(actor, {status: "pending_payment", cursor: first.nextCursor})).rejects.toThrow("INVALID_CURSOR");
  });
  it("reads the exact linked membership and latest billing attempt without treating either as a profile ID", async () => {
    const payment = await adminMembersRepository.getApplicationQueuePage(actor, {status: "pending_payment"});
    expect(payment.items).toHaveLength(1);
    expect(payment.items[0]).toMatchObject({applicationId: ids.payment, profileId: "a", membershipId: "11111111-1111-4111-8111-111111111111", billingAttemptId: ids.activeAttempt, billingState: "active"});
    expect(await adminMembersRepository.getApplicationQueuePage(actor, {status: "pending_review"})).toMatchObject({items: [{applicationId: ids.review, profileId: "b", billingState: null}]});
    // Real persisted app state changes queue membership; a stale membership status cannot retain it.
    await fixture.pool.query("UPDATE membership_applications SET status='completed' WHERE id=$1", [ids.payment]);
    expect((await adminMembersRepository.getApplicationQueuePage(actor, {status: "pending_payment"})).items).toEqual([]);
  });
  it("requires staff and searches literal input without widening wildcard scope", async () => {
    await expect(adminMembersRepository.getApplicationQueuePage({kind: "member", userId: "a", profileId: "a"}, {status: "draft"})).rejects.toThrow("FORBIDDEN");
    expect((await adminMembersRepository.getApplicationQueuePage(actor, {status: "draft", search: "Ada"})).items).toHaveLength(2);
    expect((await adminMembersRepository.getApplicationQueuePage(actor, {status: "draft", search: "%"})).items).toHaveLength(0);
    expect(await adminMembersRepository.listOperationOwners(actor)).toEqual([{id: "root", name: "Root"}, {id: "staff", name: "Staff"}]);
  });
});
