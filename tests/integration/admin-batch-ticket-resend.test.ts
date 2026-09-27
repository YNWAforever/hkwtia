import {randomUUID} from "node:crypto";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedBatchDatabase} from "./admin-batch-fixture";
import {batchOperationHandlers} from "@/lib/admin/batches/handlers/registry";
import {batchPreviewDigest, batchRequestSchema} from "@/lib/admin/batches/types";
import {createAdminBatchesRepository, createAdminBatchWorkerRepository} from "@/lib/db/repos/admin-batches";

const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
const staff = {kind: "staff", userId: "staff", profileId: "staff"} as const;
const eventId = "33333333-3333-4333-8333-333333333333";
const orderId = "44444444-4444-4444-8444-444444444444";
const seatId = "55555555-5555-4555-8555-555555555555";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;

describe.skipIf(!enabled)("ticket resend batch on disposable PostgreSQL", () => {
  beforeAll(async () => {
    fixture = await isolatedBatchDatabase();
    await fixture.pool.query(`
      CREATE TABLE events (id uuid PRIMARY KEY, status text NOT NULL, starts_at timestamptz NOT NULL, registration_mode text NOT NULL);
      CREATE TABLE event_orders (id uuid PRIMARY KEY, event_id uuid NOT NULL, status text NOT NULL);
      CREATE TABLE event_order_seats (id uuid PRIMARY KEY, order_id uuid NOT NULL, checked_in_at timestamptz);
      CREATE TABLE ticket_email_outbox (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL, seat_id uuid NOT NULL, kind text NOT NULL, event_key text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'queued');
      INSERT INTO events VALUES ('33333333-3333-4333-8333-333333333333', 'published', now() + interval '30 days', 'ticketed');
      INSERT INTO event_orders VALUES ('44444444-4444-4444-8444-444444444444', '33333333-3333-4333-8333-333333333333', 'paid');
      INSERT INTO event_order_seats VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444', NULL);
    `);
  }, 60_000);
  afterAll(async () => {if (fixture) await fixture.close();});
  it("queues one pass per stable item key, then skips a revoked ticket without sending", async () => {
    process.env.TICKET_RESEND_BATCH_ENABLED = "true";
    const now = new Date();
    const request = batchRequestSchema.parse({operation: "ticket_resend", idempotencyKey: randomUUID(), targetSeatIds: [seatId], payload: {}});
    const batches = createAdminBatchesRepository(async () => fixture.database, () => now);
    const worker = createAdminBatchWorkerRepository(async () => fixture.database);
    const {batchId} = await batches.create(staff, request, batchPreviewDigest(request));
    expect(await worker.prepareNext(batchOperationHandlers, now)).toBe(true);
    const preview = await batches.preview(staff, batchId);
    expect(preview).toMatchObject({total: 1, eligible: 1});
    await batches.commit(staff, batchId, preview.digest);
    const claims = await worker.claimItems("resend-worker", now, 5);
    expect(claims).toHaveLength(1);
    expect(await worker.executeClaim(claims[0]!, batchOperationHandlers.ticket_resend!, now)).toBe("settled");
    const rows = await fixture.pool.query("SELECT order_id,seat_id,kind,event_key FROM ticket_email_outbox");
    expect(rows.rows).toEqual([expect.objectContaining({order_id: orderId, seat_id: seatId, kind: "pass", event_key: "ticket-resend:" + claims[0]!.effectKey})]);
    const final = await batches.preview(staff, batchId);
    expect(final.counters.succeeded).toBe(1);

    const second = batchRequestSchema.parse({operation: "ticket_resend", idempotencyKey: randomUUID(), targetSeatIds: [seatId], payload: {}});
    const secondId = (await batches.create(staff, second, batchPreviewDigest(second))).batchId;
    await worker.prepareNext(batchOperationHandlers, now);
    const secondPreview = await batches.preview(staff, secondId);
    await batches.commit(staff, secondId, secondPreview.digest);
    await fixture.pool.query("UPDATE events SET status='cancelled' WHERE id=$1", [eventId]);
    const secondClaims = await worker.claimItems("resend-worker", now, 5);
    expect(secondClaims).toHaveLength(1);
    await worker.executeClaim(secondClaims[0]!, batchOperationHandlers.ticket_resend!, now);
    expect((await batches.preview(staff, secondId)).counters.skipped).toBe(1);
    expect((await fixture.pool.query("SELECT count(*)::int AS n FROM ticket_email_outbox")).rows[0]?.n).toBe(1);
    delete process.env.TICKET_RESEND_BATCH_ENABLED;
  }, 60_000);
});
