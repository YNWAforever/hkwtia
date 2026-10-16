import {randomUUID, createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {drizzle} from "drizzle-orm/node-postgres";
import type {Pool} from "pg";
import {afterAll, beforeAll, beforeEach, describe, expect, it, vi} from "vitest";
import {portalHistoryPostgres} from "./portal-history-postgres";
const databaseState = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (original) => ({...await original<typeof import("@/lib/db/repos/common")>(), getDb: async () => databaseState.current}));
import {seatInviteBatchesRepository as repository} from "@/lib/db/repos/seat-invite-batches";
import {previewSeatInvites, commitSeatInvites} from "@/lib/portal/seat-bulk-core";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const fixture = portalHistoryPostgres();
const companyId = randomUUID(), otherCompanyId = randomUUID();
const actor = {kind: "member", userId: "auth-owner", profileId: "owner"} as const;
const other = {kind: "member", userId: "auth-other", profileId: "other"} as const;
let pool: Pool;
async function prepare(rows = "person@example.test", confirmElevated = false) {
  const snapshot = await previewSeatInvites(actor, {companyId, rows, locale: "en"});
  const request = {companyId, snapshotId: snapshot.batchId, requestId: randomUUID(), selectedItemIds: snapshot.items.filter((row) => row.state === "preview").map((row) => row.itemId), confirmElevated};
  const view = await commitSeatInvites(actor, request);
  return {view, request, target: {companyId, batchId: view.batchId}};
}

describe.skipIf(!enabled)("seat invitation batches on disposable PostgreSQL", () => {
  beforeAll(async () => {
    pool = await fixture.start(); databaseState.current = drizzle(pool);
    await pool.query(`CREATE TYPE company_member_role AS ENUM ('owner', 'admin', 'member');
      CREATE TABLE profiles (id text PRIMARY KEY, email text, display_name text);
      CREATE TABLE companies (id uuid PRIMARY KEY);
      CREATE TABLE memberships (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, status text, seat_limit integer, grant_effective_at timestamptz, grant_expires_at timestamptz);
      CREATE TABLE company_members (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid, user_id text, role company_member_role, joined_at timestamptz DEFAULT now(), revoked_at timestamptz);
      CREATE TABLE seat_invitations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid NOT NULL, inviter_user_id text NOT NULL, invited_email text NOT NULL,
        role company_member_role NOT NULL, token_digest text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, accepted_at timestamptz, accepted_by_user_id text, revoked_at timestamptz, created_at timestamptz DEFAULT now());
      CREATE TABLE audit_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id text, actor_type text NOT NULL, action text NOT NULL, target_type text NOT NULL, target_id text NOT NULL, request_id text, metadata jsonb, created_at timestamptz DEFAULT now());`);
    // Exercise the exact additive migration against the relevant pre-existing tables.
    await pool.query(readFileSync("drizzle/0065_portal_seat_batches.sql", "utf8"));
    await pool.query("INSERT INTO profiles VALUES ('owner', 'owner@example.test', 'Owner'), ('other', 'other@example.test', 'Other')");
    await pool.query("INSERT INTO companies VALUES ($1), ($2)", [companyId, otherCompanyId]);
    await pool.query("INSERT INTO memberships (company_id, status, seat_limit) VALUES ($1, 'active', 5), ($2, 'active', 25)", [companyId, otherCompanyId]);
    await pool.query("INSERT INTO company_members (company_id, user_id, role) VALUES ($1, 'owner', 'owner'), ($2, 'other', 'owner')", [companyId, otherCompanyId]);
  }, 60_000);
  beforeEach(async () => {
    await pool.query("TRUNCATE portal_seat_batch_items, portal_seat_batches, seat_invitations, audit_events CASCADE");
    await pool.query("UPDATE memberships SET seat_limit = 5 WHERE company_id = $1", [companyId]);
    await pool.query("UPDATE company_members SET role = 'owner', revoked_at = NULL WHERE user_id = 'owner'");
  });
  afterAll(() => fixture.stop());

  it("keeps 5/25-seat preview capacity, flags duplicate/current members and requires explicit elevated-role confirmation", async () => {
    const snapshot = await previewSeatInvites(actor, {companyId, locale: "en", rows: "owner@example.test\na@example.test,admin\na@example.test\nbad"});
    expect(snapshot.available).toBe(4);
    expect(snapshot.items.map((row) => row.code)).toEqual(["MEMBERSHIP_EXISTS", null, "DUPLICATE", "INVALID_EMAIL"]);
    const otherSnapshot = await previewSeatInvites(other, {companyId: otherCompanyId, locale: "en", rows: "b@example.test"});
    expect(otherSnapshot.available).toBe(24);
    await expect(commitSeatInvites(actor, {companyId, snapshotId: snapshot.batchId, requestId: randomUUID(), selectedItemIds: [snapshot.items[1].itemId], confirmElevated: false})).rejects.toThrow("ELEVATED_CONFIRMATION_REQUIRED");
    expect((await pool.query("SELECT count(*)::int AS count FROM seat_invitations")).rows[0].count).toBe(0);
  });
  it("commits the immutable snapshot once and keeps all private delivery payload out of the view", async () => {
    const {request, target} = await prepare();
    await commitSeatInvites(actor, request); await commitSeatInvites(actor, {...request, requestId: randomUUID()});
    expect((await pool.query("SELECT count(*)::int AS count FROM audit_events WHERE action = 'seat.batch.committed'")).rows[0].count).toBe(1);
    await Promise.all([repository.prepareNext(actor, target), repository.prepareNext(actor, target)]);
    const invitations = (await pool.query("SELECT * FROM seat_invitations")).rows;
    expect(invitations).toHaveLength(1);
    const item = (await pool.query("SELECT delivery_token FROM portal_seat_batch_items")).rows[0];
    expect(createHash("sha256").update(item.delivery_token).digest("hex")).toBe(invitations[0].token_digest);
    const text = JSON.stringify(await repository.read(actor, target));
    expect(text).not.toContain(item.delivery_token); expect(text).not.toContain(invitations[0].token_digest);
  });
  it("serializes competing batches against the last available seat", async () => {
    await pool.query("UPDATE memberships SET seat_limit = 2 WHERE company_id = $1", [companyId]);
    const a = await prepare("a@example.test"), b = await prepare("b@example.test");
    await Promise.all([repository.prepareNext(actor, a.target), repository.prepareNext(actor, b.target)]);
    expect((await pool.query("SELECT count(*)::int AS count FROM seat_invitations")).rows[0].count).toBe(1);
    const items = (await pool.query("SELECT state, error_code FROM portal_seat_batch_items")).rows;
    expect(items).toEqual(expect.arrayContaining([{state: "delivery_pending", error_code: null}, {state: "failed", error_code: "SEAT_LIMIT_REACHED"}]));
  });
  it("rolls back the invitation when saving its outbox payload fails, then safely resumes the same item", async () => {
    const {target} = await prepare();
    await pool.query("CREATE FUNCTION reject_seat_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.state = 'delivery_pending' THEN RAISE EXCEPTION 'injected outbox failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_outbox BEFORE UPDATE ON portal_seat_batch_items FOR EACH ROW EXECUTE FUNCTION reject_seat_outbox()");
    try {
      await expect(repository.prepareNext(actor, target)).rejects.toThrow();
      expect((await pool.query("SELECT count(*)::int AS count FROM seat_invitations")).rows[0].count).toBe(0);
      expect((await repository.read(actor, target)).items[0].state).toBe("pending");
    } finally {await pool.query("DROP TRIGGER reject_outbox ON portal_seat_batch_items; DROP FUNCTION reject_seat_outbox()");}
    await repository.prepareNext(actor, target);
    expect((await pool.query("SELECT count(*)::int AS count FROM seat_invitations")).rows[0].count).toBe(1);
  });
  it("rechecks revoked management and changed owner-grant permissions before writing", async () => {
    const {target} = await prepare("a@example.test,owner", true);
    await pool.query("UPDATE company_members SET revoked_at = now() WHERE user_id = 'owner'");
    await expect(repository.prepareNext(actor, target)).rejects.toThrow("FORBIDDEN");
    expect((await pool.query("SELECT count(*)::int AS count FROM seat_invitations")).rows[0].count).toBe(0);
    await pool.query("UPDATE company_members SET revoked_at = NULL, role = 'admin' WHERE user_id = 'owner'");
    await repository.prepareNext(actor, target);
    expect((await repository.read(actor, target)).items[0]).toMatchObject({state: "failed", code: "ROLE_POLICY"});
  });
  it("claims a send once and never retries an expired or uncertain claim", async () => {
    const {target} = await prepare(); await repository.prepareNext(actor, target);
    const claims = await Promise.all([repository.claimDelivery(actor, target), repository.claimDelivery(actor, target)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await pool.query("UPDATE portal_seat_batch_items SET claim_expires_at = now() - interval '1 minute'");
    expect((await repository.read(actor, target)).items[0]).toMatchObject({state: "uncertain", retryable: false});
    await repository.retry(actor, target);
    expect(await repository.claimDelivery(actor, target)).toBeNull();
    expect((await pool.query("SELECT delivery_token, state FROM portal_seat_batch_items")).rows[0]).toEqual({delivery_token: null, state: "uncertain"});
    expect((await pool.query("SELECT revoked_at FROM seat_invitations")).rows[0].revoked_at).toBeNull();
  });
  it("cancels only unsent work while preserving an already-started claim and its final receipt", async () => {
    const {target} = await prepare("a@example.test\nb@example.test");
    await repository.prepareNext(actor, target); await repository.prepareNext(actor, target);
    const claim = await repository.claimDelivery(actor, target); expect(claim).not.toBeNull();
    await repository.cancel(actor, target);
    expect((await pool.query("SELECT count(*)::int AS count FROM seat_invitations WHERE revoked_at IS NOT NULL")).rows[0].count).toBe(1);
    await pool.query("UPDATE company_members SET revoked_at = now() WHERE user_id = 'owner'");
    await repository.settleDelivery(actor, {...target, itemId: claim!.itemId, claimId: claim!.claimId, outcome: "succeeded"});
    expect((await pool.query("SELECT state FROM portal_seat_batch_items WHERE id = $1", [claim!.itemId])).rows[0].state).toBe("succeeded");
    await expect(repository.read(actor, target)).rejects.toThrow("FORBIDDEN");
  });
  it("rejects cross-company snapshot IDs without revealing recipients", async () => {
    const {target} = await prepare();
    await expect(repository.read(other, {...target, companyId: otherCompanyId})).rejects.toThrow("BATCH_NOT_FOUND");
    await expect(repository.commit(other, {companyId: otherCompanyId, snapshotId: target.batchId, requestId: randomUUID(), selectedItemIds: [randomUUID()], confirmElevated: true})).rejects.toThrow("BATCH_NOT_FOUND");
  });
});
