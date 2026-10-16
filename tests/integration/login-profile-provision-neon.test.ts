import {randomUUID} from "node:crypto";

import {Pool} from "@neondatabase/serverless";
import {drizzle} from "drizzle-orm/neon-serverless";
import {describe, expect, it} from "vitest";

import {createProfileIdentityRepository} from "@/lib/db/repos/profile-identities";

const enabled = process.env.RUN_NEON_PROFILE_INTEGRATION === "1";

describe.skipIf(!enabled)("Neon runtime profile provisioning", () => {
  it("creates and resolves one synthetic profile on an explicitly isolated test host", async () => {
    const connection = process.env.DATABASE_URL_TEST;
    if (!connection) throw new Error("DATABASE_URL_TEST is required");
    if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") {
      throw new Error("Production execution is prohibited");
    }
    if (connection === process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL_TEST must differ from DATABASE_URL");
    }
    const host = new URL(connection).hostname;
    const allowlist = (process.env.NEON_PROFILE_TEST_HOST_ALLOWLIST ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    if (!allowlist.includes(host)) {
      throw new Error("DATABASE_URL_TEST host must be explicitly allowlisted for an isolated database");
    }

    const pool = new Pool({connectionString: connection});
    const repo = createProfileIdentityRepository(async () => drizzle(pool) as never);
    const authUserId = "audit-profile-" + randomUUID();
    const email = authUserId + "@example.test";
    try {
      await expect(repo.provisionMember({authUserId, email, displayName: "Synthetic member"}))
        .resolves.toEqual({kind: "ready", identity: {profileId: authUserId, role: "member"}});
      const rows = await pool.query("SELECT role FROM profiles WHERE auth_user_id = $1 AND email = $2", [authUserId, email]);
      expect(rows.rows).toEqual([{role: "member"}]);
    } finally {
      try {
        const removed = await pool.query("DELETE FROM profiles WHERE auth_user_id = $1 AND email = $2", [authUserId, email]);
        expect(removed.rowCount).toBeLessThanOrEqual(1);
      } finally {
        await pool.end();
      }
    }
  }, 30_000);
});
