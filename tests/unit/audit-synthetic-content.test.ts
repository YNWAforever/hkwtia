import {describe, expect, it, vi} from "vitest";

import {
  COMPANY_IDS as M5_COMPANY_IDS,
  LISTING_IDS as M5_LISTING_IDS,
} from "@/scripts/seed-m5";
import {
  APPLICATION_IDS as M6_APPLICATION_IDS,
  COHORT_ID as M6_COHORT_ID,
  COMPANY_IDS as M6_COMPANY_IDS,
  PARTNER_IDS as M6_PARTNER_IDS,
} from "@/scripts/seed-m6";
import {M2_PROFILE_ROWS, M2_UUIDS} from "@/scripts/seed-m2";
import {M3_PROFILE_IDS, M3_SEED_UUIDS} from "@/scripts/seed-m3";
import {
  AuditDeleteCountMismatchError,
  DELETE_ORDER,
  HIDE_STATEMENTS,
  buildSyntheticMarkers,
  deleteSyntheticContent,
  hideSyntheticContent,
  inventorySyntheticRows,
  parseAuditMode,
  type AuditConnection,
} from "@/scripts/audit-synthetic-content";

type QueryCall = Readonly<{text: string; values: readonly unknown[] | undefined}>;

function fakeConnection(
  rowsFor?: (text: string, values: readonly unknown[] | undefined) => readonly Record<string, unknown>[],
): Readonly<{connection: AuditConnection; calls: QueryCall[]}> {
  const calls: QueryCall[] = [];
  const connection: AuditConnection = {
    query: vi.fn(async (text: string, values?: readonly unknown[]) => {
      calls.push({text, values});
      return {rows: rowsFor?.(text, values) ?? []};
    }),
  };
  return {connection, calls};
}

describe("buildSyntheticMarkers", () => {
  it("sources every id list from the seed modules, not literals in this file", () => {
    const markers = buildSyntheticMarkers();

    const byTableAndSource = (table: string, source: string) =>
      markers.find((marker) => marker.table === table && marker.source === source);

    expect(byTableAndSource("companies", "scripts/seed-m5.ts COMPANY_IDS")?.ids).toEqual(M5_COMPANY_IDS);
    expect(byTableAndSource("showcase_listings", "scripts/seed-m5.ts LISTING_IDS")?.ids).toEqual(M5_LISTING_IDS);
    expect(byTableAndSource("leads", "scripts/seed-m5.ts LISTING_IDS (leads.listing_id)")?.ids).toEqual(M5_LISTING_IDS);

    expect(byTableAndSource("cohorts", "scripts/seed-m6.ts COHORT_ID")?.ids).toEqual([M6_COHORT_ID]);
    expect(byTableAndSource("companies", "scripts/seed-m6.ts COMPANY_IDS")?.ids).toEqual(M6_COMPANY_IDS);
    expect(byTableAndSource("landing_partners", "scripts/seed-m6.ts PARTNER_IDS")?.ids).toEqual(M6_PARTNER_IDS);
    expect(byTableAndSource("cohort_applications", "scripts/seed-m6.ts APPLICATION_IDS")?.ids).toEqual(M6_APPLICATION_IDS);

    const m2ProfileIds = M2_PROFILE_ROWS.map((row) => row.id);
    expect(byTableAndSource("profiles", "scripts/seed-m2.ts M2_PROFILE_ROWS")?.ids).toEqual(m2ProfileIds);
    expect(m2ProfileIds).toHaveLength(30);
    expect(byTableAndSource("companies", "scripts/seed-m2.ts M2_UUIDS.companies")?.ids).toEqual(M2_UUIDS.companies);
    expect(byTableAndSource("events", "scripts/seed-m2.ts M2_UUIDS.events")?.ids).toEqual(M2_UUIDS.events);
    expect(byTableAndSource("event_registrations", "scripts/seed-m2.ts M2_UUIDS.events (event_registrations.event_id)")?.ids)
      .toEqual(M2_UUIDS.events);

    const m3ProfileIds = Object.values(M3_PROFILE_IDS);
    expect(byTableAndSource("profiles", "scripts/seed-m3.ts M3_PROFILE_IDS")?.ids).toEqual(m3ProfileIds);
    expect(m3ProfileIds).toHaveLength(9);
    expect(byTableAndSource("memberships", "scripts/seed-m3.ts M3_SEED_UUIDS.memberships")?.ids)
      .toEqual(Object.values(M3_SEED_UUIDS.memberships));
  });

  it("matches every table to exactly one column, so a table never needs two mutually-exclusive WHERE clauses", () => {
    const byTable = new Map<string, Set<string>>();
    for (const marker of buildSyntheticMarkers()) {
      const columns = byTable.get(marker.table) ?? new Set<string>();
      columns.add(marker.matchColumn);
      byTable.set(marker.table, columns);
    }
    for (const [table, columns] of byTable) {
      expect(columns.size, `${table} is matched through more than one column`).toBe(1);
    }
  });

  it("has a DELETE_ORDER entry for every marker table and no unknown tables", () => {
    const markerTables = new Set(buildSyntheticMarkers().map((marker) => marker.table));
    expect([...markerTables].sort()).toEqual([...DELETE_ORDER].sort());
  });
});

describe("DELETE_ORDER", () => {
  const indexOf = (table: string) => DELETE_ORDER.indexOf(table);

  it("orders every marker's dependent tables before the tables they reference", () => {
    expect(indexOf("leads")).toBeLessThan(indexOf("showcase_listings"));
    expect(indexOf("showcase_listings")).toBeLessThan(indexOf("companies"));
    expect(indexOf("cohort_applications")).toBeLessThan(indexOf("cohorts"));
    expect(indexOf("cohort_applications")).toBeLessThan(indexOf("companies"));
    expect(indexOf("company_members")).toBeLessThan(indexOf("companies"));
    expect(indexOf("company_members")).toBeLessThan(indexOf("profiles"));
    expect(indexOf("membership_applications")).toBeLessThan(indexOf("companies"));
    expect(indexOf("membership_applications")).toBeLessThan(indexOf("profiles"));
    expect(indexOf("memberships")).toBeLessThan(indexOf("companies"));
    expect(indexOf("memberships")).toBeLessThan(indexOf("profiles"));
    expect(indexOf("event_registrations")).toBeLessThan(indexOf("events"));
    // profiles is referenced with ON DELETE RESTRICT by these tables, so
    // they must be gone before profiles is deleted or the DELETE aborts.
    expect(indexOf("campaign_recipients")).toBeLessThan(indexOf("profiles"));
    expect(indexOf("campaigns")).toBeLessThan(indexOf("profiles"));
    expect(indexOf("saved_segments")).toBeLessThan(indexOf("profiles"));
    expect(indexOf("member_notes")).toBeLessThan(indexOf("profiles"));
    // profiles and companies are the two most-referenced tables: last.
    expect(indexOf("profiles")).toBe(DELETE_ORDER.length - 1);
  });
});

describe("inventorySyntheticRows (default, read-only path)", () => {
  it("issues only SELECTs and reports table, row id, and matched marker", async () => {
    const {connection, calls} = fakeConnection((text) => {
      if (text.includes("FROM showcase_listings")) return [{row_id: M5_LISTING_IDS[0]}];
      return [];
    });

    const rows = await inventorySyntheticRows(connection);

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(({text}) => /^\s*SELECT/i.test(text))).toBe(true);
    expect(calls.some(({text}) => /\b(DELETE|UPDATE|INSERT|TRUNCATE|DROP)\b/i.test(text))).toBe(false);

    expect(rows).toContainEqual({
      table: "showcase_listings",
      rowId: M5_LISTING_IDS[0],
      source: "scripts/seed-m5.ts LISTING_IDS",
    });
  });

  it("skips markers with no ids without issuing a query for them", async () => {
    const markers = buildSyntheticMarkers().map((marker) =>
      marker.table === "jobs" ? {...marker, ids: []} : marker);
    const {connection, calls} = fakeConnection();

    await inventorySyntheticRows(connection, markers);

    expect(calls.some(({text}) => text.includes("FROM jobs"))).toBe(false);
  });
});

describe("hideSyntheticContent (--hide)", () => {
  it("issues only UPDATEs, never DELETE/TRUNCATE/DROP", async () => {
    const {connection, calls} = fakeConnection(() => [{id: "x"}]);

    await hideSyntheticContent(connection);

    expect(calls.length).toBe(HIDE_STATEMENTS.length);
    expect(calls.every(({text}) => /^\s*UPDATE/i.test(text))).toBe(true);
    expect(calls.some(({text}) => /\b(DELETE|TRUNCATE|DROP|INSERT)\b/i.test(text))).toBe(false);
  });

  it("moves showcase_listings, cohorts, and events to the schema's real non-public values", async () => {
    const {connection, calls} = fakeConnection(() => [{id: "x"}]);

    await hideSyntheticContent(connection);

    const showcase = calls.find(({text}) => text.includes("showcase_listings"));
    const cohort = calls.find(({text}) => text.includes("UPDATE cohorts"));
    const event = calls.find(({text}) => text.includes("UPDATE events"));

    expect(showcase?.text).toContain("'draft'::showcase_listing_status");
    expect(cohort?.text).toContain("'archived'::cohort_status");
    expect(event?.text).toContain("published = false");
  });

  it("scopes each UPDATE to the ids sourced from the matching seed constants", async () => {
    const {connection, calls} = fakeConnection(() => [{id: "x"}]);

    await hideSyntheticContent(connection);

    const showcase = calls.find(({text}) => text.includes("showcase_listings"));
    expect(showcase?.values?.[0]).toEqual(M5_LISTING_IDS);
    const cohort = calls.find(({text}) => text.includes("UPDATE cohorts"));
    expect(cohort?.values?.[0]).toEqual([M6_COHORT_ID]);
    const landingPartners = calls.find(({text}) => text.includes("UPDATE landing_partners"));
    expect(landingPartners?.text).toBe(
      "UPDATE landing_partners SET published_at = NULL, updated_at = now() WHERE id = ANY($1::uuid[]) RETURNING id",
    );
    expect(landingPartners?.values?.[0]).toEqual(M6_PARTNER_IDS);
    const event = calls.find(({text}) => text.includes("UPDATE events"));
    expect(event?.values?.[0]).toEqual(M2_UUIDS.events);
  });
});

describe("deleteSyntheticContent (--delete)", () => {
  it("refuses to delete when CONFIRM_DELETE_COUNT does not match a fresh inventory", async () => {
    const {connection, calls} = fakeConnection((text) => {
      if (/^\s*SELECT/i.test(text) && !text.includes("pg_advisory")) return [{row_id: "x"}];
      return [];
    });

    await expect(deleteSyntheticContent(connection, {confirmDeleteCount: 999}))
      .rejects.toThrow(AuditDeleteCountMismatchError);

    expect(calls.some(({text}) => /^\s*DELETE/i.test(text))).toBe(false);
    expect(calls.some(({text}) => text === "ROLLBACK")).toBe(true);
    expect(calls.some(({text}) => text === "COMMIT")).toBe(false);
  });

  it("deletes in DELETE_ORDER, commits, and only issues DELETEs (plus the transaction/lock statements) once confirmed", async () => {
    // Every marker table's SELECT returns exactly one row, so the total
    // inventory count equals the number of tables with ids -- every marker
    // table here has at least one id, so it's the full DELETE_ORDER length.
    const {connection, calls} = fakeConnection((text) => {
      if (/^\s*SELECT/i.test(text) && !text.includes("pg_advisory")) return [{row_id: "x"}];
      return [];
    });
    const expectedCount = (await inventorySyntheticRows(connection)).length;
    calls.length = 0;

    const results = await deleteSyntheticContent(connection, {confirmDeleteCount: expectedCount});

    const deleteCalls = calls.filter(({text}) => /^\s*DELETE/i.test(text));
    const deletedTablesInOrder = deleteCalls.map(({text}) => {
      const match = /DELETE FROM (\w+)/.exec(text);
      if (!match) throw new Error("Expected a table name in the DELETE statement");
      return match[1];
    });
    const expectedOrder = DELETE_ORDER.filter((table) => deletedTablesInOrder.includes(table));
    expect(deletedTablesInOrder).toEqual(expectedOrder);

    expect(calls.some(({text}) => text === "BEGIN")).toBe(true);
    expect(calls.some(({text}) => text === "COMMIT")).toBe(true);
    expect(calls.some(({text}) => text === "ROLLBACK")).toBe(false);
    expect(calls.every(({text}) =>
      /^\s*(SELECT|DELETE|BEGIN|COMMIT|ROLLBACK)\b/i.test(text) || text.includes("pg_advisory_xact_lock"))).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("rolls back and rethrows if a DELETE fails partway through", async () => {
    const {connection, calls} = fakeConnection((text) => {
      if (/^\s*SELECT/i.test(text) && !text.includes("pg_advisory")) return [{row_id: "x"}];
      return [];
    });
    const expectedCount = (await inventorySyntheticRows(connection)).length;
    calls.length = 0;

    const failing: AuditConnection = {
      query: vi.fn(async (text: string, values?: readonly unknown[]) => {
        calls.push({text, values});
        if (text.startsWith("DELETE FROM leads")) throw new Error("boom");
        if (/^\s*SELECT/i.test(text) && !text.includes("pg_advisory")) return {rows: [{row_id: "x"}]};
        return {rows: []};
      }),
    };

    await expect(deleteSyntheticContent(failing, {confirmDeleteCount: expectedCount})).rejects.toThrow("boom");
    expect(calls.some(({text}) => text === "ROLLBACK")).toBe(true);
    expect(calls.some(({text}) => text === "COMMIT")).toBe(false);
  });
});

describe("parseAuditMode", () => {
  it("defaults to inventory with no flags", () => {
    expect(parseAuditMode([])).toBe("inventory");
  });

  it("recognizes --hide and --delete", () => {
    expect(parseAuditMode(["--hide"])).toBe("hide");
    expect(parseAuditMode(["--delete"])).toBe("delete");
  });

  it("rejects passing both mutation flags together", () => {
    expect(() => parseAuditMode(["--hide", "--delete"])).toThrow("AUDIT_FLAGS_EXCLUSIVE");
  });
});
