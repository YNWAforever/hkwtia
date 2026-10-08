import {afterAll, beforeAll, describe, expect, it} from "vitest";

import {isolatedAuditDatabase} from "./audit-database-fixture";

// Migration 0062 (owner decision 2026-10-08): every existing company is listed in the member
// directory, each switch leaves an audit row, and new companies still start hidden.
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")("0062 company directory backfill", () => {
  let fixture: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
  const hidden = "00000000-0000-4000-8000-000000000001";
  const listed = "00000000-0000-4000-8000-000000000002";

  beforeAll(async () => {
    fixture = await isolatedAuditDatabase(61);
    await fixture.pool.query(
      "INSERT INTO companies (id, legal_name, display_name, directory_visible) VALUES ($1, 'Hidden Ltd', 'Hidden', false), ($2, 'Listed Ltd', 'Listed', true)",
      [hidden, listed],
    );
    await fixture.migrateRemaining();
  }, 180_000);

  afterAll(async () => {
    await fixture?.close();
  });

  it("lists every existing company", async () => {
    const {rows} = await fixture.pool.query<{id: string; directory_visible: boolean}>("SELECT id, directory_visible FROM companies WHERE id IN ($1, $2) ORDER BY id", [hidden, listed]);
    expect(rows).toEqual([{id: hidden, directory_visible: true}, {id: listed, directory_visible: true}]);
  });

  it("audits only the companies it switched, so the backfill can be reversed exactly", async () => {
    const {rows} = await fixture.pool.query<{target_id: string; actor_type: string; metadata: Record<string, unknown>}>(
      "SELECT target_id, actor_type, metadata FROM audit_events WHERE action = 'company.directory_visible.backfill'",
    );
    expect(rows).toEqual([{target_id: hidden, actor_type: "system", metadata: {from: false, to: true, migration: "0062_company_directory_visible_backfill"}}]);
  });

  it("leaves new companies hidden until they switch it on", async () => {
    const {rows} = await fixture.pool.query<{column_default: string}>(
      "SELECT column_default FROM information_schema.columns WHERE table_name = 'companies' AND column_name = 'directory_visible'",
    );
    expect(rows[0]?.column_default).toBe("false");
  });
});
