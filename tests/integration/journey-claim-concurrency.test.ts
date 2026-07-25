import {Pool} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-serverless";
import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {createJourneysRepository, type AutomationDatabase} from "@/lib/db/repos/journeys";

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const profileId = `m3-claim-${process.pid}-${Date.now()}`;
const system = {kind: "system", userId: null, source: "stripe-webhook"} as const;
let pool: Pool | undefined;

describe.skipIf(!testDatabaseUrl)("journey due-claim concurrency on isolated Postgres", () => {
  beforeAll(async () => {
    pool = new Pool({connectionString: testDatabaseUrl});
    await pool.query(
      `INSERT INTO profiles (id, auth_user_id, display_name)
       VALUES ($1, $2, 'M3 claim test')
       ON CONFLICT (id) DO NOTHING`,
      [profileId, `auth-${profileId}`],
    );
  });

  afterAll(async () => {
    if (!pool) return;
    await pool.query("DELETE FROM profiles WHERE id = $1", [profileId]);
    await pool.end();
  });

  it("claims one due row exactly once across concurrent transactions", async () => {
    if (!pool) throw new Error("DATABASE_URL_TEST pool was not initialized");
    const db = drizzle(pool) as unknown as AutomationDatabase;
    const repo = createJourneysRepository(async () => db);
    const now = new Date("2027-01-15T10:00:00.000Z");
    const deliveryKey = `journey:${profileId}:onboarding_90d:activation:test:welcome`;

    await expect(repo.enroll(system, {
      profileId,
      membershipId: null,
      journey: "onboarding_90d",
      instanceKey: "activation:test",
      step: "welcome",
      scheduledAt: new Date(now.getTime() - 1_000),
      deliveryKey,
    })).resolves.toBe("created");

    const [left, right] = await Promise.all([
      repo.claimDue(system, now, 1, 300_000),
      repo.claimDue(system, now, 1, 300_000),
    ]);

    expect([...left, ...right]).toHaveLength(1);
    expect([...left, ...right][0]).toMatchObject({profileId, deliveryKey, status: "processing", attemptCount: 1});
  });

  it("reclaims an expired processing lease and fences the stale worker token", async () => {
    if (!pool) throw new Error("DATABASE_URL_TEST pool was not initialized");
    const db = drizzle(pool) as unknown as AutomationDatabase;
    const repo = createJourneysRepository(async () => db);
    const now = new Date("2027-01-15T12:00:00.000Z");
    const oldClaimedAt = new Date(now.getTime() - 600_000);
    const deliveryKey = `journey:${profileId}:onboarding_90d:activation:stale:welcome`;
    const inserted = await pool.query<{id: string}>(
      `INSERT INTO journey_state
         (profile_id, journey, instance_key, step, scheduled_at, status, attempt_count,
          claimed_at, claim_expires_at, delivery_key)
       VALUES ($1, 'onboarding_90d', 'activation:stale', 'welcome', $2, 'processing', 1, $3, $4, $5)
       RETURNING id`,
      [
        profileId,
        new Date(now.getTime() - 900_000),
        oldClaimedAt,
        new Date(now.getTime() - 1_000),
        deliveryKey,
      ],
    );
    const journeyId = inserted.rows[0]?.id;
    if (!journeyId) throw new Error("expired journey row was not inserted");

    const claimed = await repo.claimDue(system, now, 10, 300_000);
    const reclaimed = claimed.find((row) => row.id === journeyId);
    expect(reclaimed).toMatchObject({
      id: journeyId,
      status: "processing",
      attemptCount: 2,
      claimedAt: now,
    });
    if (!reclaimed?.claimedAt) throw new Error("reclaimed row has no fencing token");

    await expect(repo.markSent(system, journeyId, oldClaimedAt, now))
      .rejects.toMatchObject({code: "INVALID_TRANSITION"});
    await expect(repo.markSent(system, journeyId, reclaimed.claimedAt, now))
      .resolves.toMatchObject({id: journeyId, status: "sent"});
  });
});
