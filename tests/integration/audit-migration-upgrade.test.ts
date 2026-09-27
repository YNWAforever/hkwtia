import {describe,expect,it} from "vitest";
import {isolatedAuditDatabase} from "./audit-database-fixture";
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION!=="1")("incremental audit migration and old writer compatibility",()=>{
  it("demonstrates the historical timestamp bug using a temporary journal and disposable database only",async()=>{
    const fixture=await isolatedAuditDatabase(47);
    try {
      await fixture.applyHistoricalOrdering();
      const columns=await fixture.pool.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='memberships' AND column_name='grant_expires_at'");
      expect(columns.rows[0].n).toBe(0); // The original metadata silently skipped 0048 after 0047.
    } finally {await fixture.close();}
  },120_000);
  it("applies grants after an imports-only deployment and preserves indefinite historical rows",async()=>{
    const fixture=await isolatedAuditDatabase(47);
    try {
      await fixture.pool.query("INSERT INTO profiles(id,auth_user_id,display_name) VALUES ('historical','historical','Synthetic historical member')");
      await fixture.pool.query("INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit) VALUES ('historical','community','active',1)");
      const count=await fixture.pool.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='memberships' AND column_name='grant_expires_at'");
      expect(count.rows[0].n).toBe(0);
      await fixture.migrateRemaining();await fixture.migrateRemaining();
      const columns=await fixture.pool.query("SELECT count(*)::int n FROM information_schema.columns WHERE table_name='memberships' AND column_name='grant_expires_at'");
      expect(columns.rows[0].n).toBe(1);
      expect((await fixture.pool.query("SELECT grant_effective_at,grant_expires_at,grant_reason FROM memberships WHERE owner_user_id='historical'")).rows[0]).toEqual({grant_effective_at:null,grant_expires_at:null,grant_reason:null});
      // Rollback compatibility: an old writer omits all additive grant columns.
      await fixture.pool.query("INSERT INTO profiles(id,auth_user_id,display_name) VALUES ('old-writer','old-writer','Synthetic old writer')");
      await fixture.pool.query("INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit) VALUES ('old-writer','community','active',1)");
      expect((await fixture.pool.query("SELECT count(*)::int n FROM memberships")).rows[0].n).toBe(2);
    } finally {await fixture.close();}
  },120_000);
});
