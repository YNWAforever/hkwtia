// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isolatedBatchDatabase } from "./admin-batch-fixture";
import { adminMembersRepository } from "@/lib/db/repos/admin-members";
import { resolveMemberSelectionIds } from "@/lib/admin/batches/selection";
import { parseMemberSelection } from "@/lib/admin/member-selection";
import type { AdminActor } from "@/lib/membership/lifecycle";
import type { BatchExecutor } from "@/lib/db/repos/admin-batches";

const actor = { kind: "staff", profileId: "staff", userId: "staff" } as const;
const prefix = "t13-" + randomUUID();
const enabled = process.env.RUN_POSTGRES_INTEGRATION === "1";
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;
const receipt: Record<string, unknown> = {
  environment:
    "disposable local PostgreSQL16; synthetic profiles; no providers",
  production: false,
};
const dialect = new PgDialect();
function selection(size: 50 | 500 | 5000, excludedProfileIds: string[] = []) {
  return parseMemberSelection({
    mode: "query",
    query: {
      search: prefix,
      status: ["active"],
      renewalTo:
        size === 50 ? "2040-01-31" : size === 500 ? "2040-02-29" : "2040-03-31",
    },
    excludedProfileIds,
  });
}
function counted(executor: BatchExecutor) {
  const commands: { sql: string; params: unknown[] }[] = [];
  return {
    commands,
    tx: {
      execute: (statement: SQL) => {
        commands.push(dialect.sqlToQuery(statement));
        return executor.execute(statement);
      },
    },
  };
}
function safePlan(value: unknown): unknown {
  if (typeof value === "string")
    return value.replace(
      /[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}/gi,
      "[synthetic-id]",
    );
  if (Array.isArray(value)) return value.map(safePlan);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, safePlan(item)]),
    );
  return value;
}
describe.skipIf(!enabled)(
  "all-matching batch snapshot on actual isolated SQL",
  () => {
    beforeAll(async () => {
      fixture = await isolatedBatchDatabase();
      receipt.node = process.version;
      receipt.platform = process.platform;
      receipt.postgresVersion = (
        await fixture.pool.query("SHOW server_version")
      ).rows[0].server_version;
      receipt.fixtureSchema =
        "existing disposable batch fixture with current0001/0006 lookup indexes; full-schema/remote acceptance remains T21/T22";
      receipt.coldSample =
        "not collected; first measured sample uses a warmed seeded pool";
      // Match production's0001/0006 lookup indexes in this disposable batch fixture.
      await fixture.pool.query(
        "CREATE INDEX memberships_owner_idx ON memberships(owner_user_id); CREATE INDEX memberships_company_idx ON memberships(company_id); CREATE INDEX company_members_user_idx ON company_members(user_id); CREATE INDEX memberships_billing_period_end_idx ON memberships(billing_period_end)",
      );
      receipt.indexSources = [
        "drizzle/0001_m1_membership.sql",
        "drizzle/0006_m2_integrity_indexes.sql",
      ];
      receipt.sourceRevision =
        process.env.T13_MEASUREMENT_REVISION ?? "2b900c5b (pre-T13 resolver)";
      receipt.sourceFileHashes = Object.fromEntries(
        ["lib/admin/batches/selection.ts", "lib/db/repos/admin-members.ts"].map(
          (file) => [
            file,
            createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
          ],
        ),
      );
      console.log("T13_SOURCE_FROZEN");
      await fixture.pool.query(
        "INSERT INTO profiles(id,display_name,email,phone,job_title,locale,role) SELECT $1||':'||lpad(n::text,5,'0'),$1||' synthetic '||n,$1||':'||n||'@synthetic.example.test','synthetic','Synthetic','en','member' FROM generate_series(1,5010) n",
        [prefix],
      );
      await fixture.pool.query(
        "INSERT INTO memberships(owner_user_id,plan_code,status,billing_period_end) SELECT id,'startup',CASE WHEN right(id,5)::int<=5000 THEN 'active' ELSE 'expired' END,CASE WHEN right(id,5)::int<=50 THEN '2040-01-15T16:00Z'::timestamptz WHEN right(id,5)::int<=500 THEN '2040-02-15T16:00Z'::timestamptz ELSE '2040-03-15T16:00Z'::timestamptz END FROM profiles WHERE id LIKE $1",
        [prefix + ":%"],
      );
      await fixture.pool.query("ANALYZE profiles");
      await fixture.pool.query("ANALYZE memberships");
    }, 120000);
    afterAll(async () => {
      if (fixture) await fixture.close();
      const dir = "docs/audits/hkwtia-2026-10-01-remediation/evidence/t13";
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        dir + "/snapshot.json",
        JSON.stringify(receipt, null, 2),
      );
    });
    it("resolves500 members with one bounded query instead of repeating page aggregates", async () => {
      const { tx, commands } = counted(fixture.database);
      const ids = await resolveMemberSelectionIds(actor, selection(500), tx);
      expect(ids).toHaveLength(500);
      expect(new Set(ids).size).toBe(500);
      receipt.selection500RoundTrips = commands.length;
      expect(commands).toHaveLength(1);
    });
    it("keeps explicit IDs and all-matching exclusions consistent, rejects total overflow before exclusions", async () => {
      const ids = await resolveMemberSelectionIds(
        actor,
        selection(50),
        fixture.database,
      );
      const excluded = ids.slice(0, 2);
      expect(
        new Set(
          await resolveMemberSelectionIds(
            actor,
            selection(50, excluded),
            fixture.database,
          ),
        ),
      ).toEqual(new Set(ids.slice(2)));
      expect(
        new Set(
          await resolveMemberSelectionIds(
            actor,
            parseMemberSelection({ mode: "ids", profileIds: ids }),
            fixture.database,
          ),
        ),
      ).toEqual(new Set(ids));
      const tooLarge = parseMemberSelection({
        mode: "query",
        query: { search: prefix },
        excludedProfileIds: [prefix + ":05010"],
      });
      await expect(
        resolveMemberSelectionIds(actor, tooLarge, fixture.database),
      ).rejects.toThrow("BATCH_TOO_LARGE");
    });
    it("rejects a non-admin before opening either explicit or all-matching selection", async () => {
      const forbidden = {
        kind: "member",
        profileId: "a",
        userId: "a",
      } as unknown as AdminActor;
      const tx = {
        execute: () => {
          throw Error("DATABASE_SHOULD_NOT_OPEN");
        },
      };
      for (const selected of [
        selection(50),
        parseMemberSelection({ mode: "ids", profileIds: ["a"] }),
      ])
        await expect(
          resolveMemberSelectionIds(forbidden, selected, tx),
        ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
    it("shares company and membership-row scope with the existing list, including revocation", async () => {
      const company = randomUUID(),
        membership = randomUUID(),
        first = prefix + ":00001",
        second = prefix + ":00002";
      try {
        await fixture.pool.query(
          "INSERT INTO companies(id,display_name) VALUES($1,$2)",
          [company, prefix + " company"],
        );
        await fixture.pool.query(
          "INSERT INTO memberships(id,company_id,plan_code,status) VALUES($1,$2,'corporate','past_due')",
          [membership, company],
        );
        await fixture.pool.query(
          "INSERT INTO company_members(user_id,company_id) VALUES($1,$3),($2,$3)",
          [first, second, company],
        );
        const selected = parseMemberSelection({
          mode: "query",
          query: {
            companyId: company,
            planCode: ["corporate"],
            status: ["past_due"],
          },
          excludedProfileIds: [],
        });
        expect(selected.mode).toBe("query");
        if (selected.mode !== "query") throw Error("INVALID_TEST_SELECTION");
        const list = await adminMembersRepository.search(
          actor,
          selected.query,
          fixture.database,
        );
        const snapshot = await resolveMemberSelectionIds(
          actor,
          selected,
          fixture.database,
        );
        expect(new Set(snapshot)).toEqual(new Set([first, second]));
        expect(new Set(snapshot)).toEqual(
          new Set(list.items.map((row) => row.profileId)),
        );
        const mixed = parseMemberSelection({
          mode: "query",
          query: {
            companyId: company,
            planCode: ["corporate"],
            status: ["active"],
          },
          excludedProfileIds: [],
        });
        expect(
          await resolveMemberSelectionIds(actor, mixed, fixture.database),
        ).toEqual([]);
        await fixture.pool.query(
          "UPDATE company_members SET revoked_at=now() WHERE user_id=$1 AND company_id=$2",
          [second, company],
        );
        expect(
          await resolveMemberSelectionIds(actor, selected, fixture.database),
        ).toEqual([first]);
      } finally {
        await fixture.pool.query(
          "DELETE FROM company_members WHERE company_id=$1",
          [company],
        );
        await fixture.pool.query("DELETE FROM memberships WHERE id=$1", [
          membership,
        ]);
        await fixture.pool.query("DELETE FROM companies WHERE id=$1", [
          company,
        ]);
      }
    });
    it("rejects invalid snapshot bounds and unsupported filters before executing SQL", async () => {
      const tx = {
        execute: () => {
          throw Error("DATABASE_SHOULD_NOT_OPEN");
        },
      };
      for (const cap of [0, 5001, 1.5])
        await expect(
          adminMembersRepository.snapshotSelectionIds(
            actor,
            { status: ["active"] },
            cap,
            tx,
          ),
        ).rejects.toThrow("INVALID_BATCH_CONFIGURATION");
      await expect(
        adminMembersRepository.snapshotSelectionIds(
          actor,
          { unexpectedFilter: true },
          5000,
          tx,
        ),
      ).rejects.toThrow();
    });
    it("retains repeatable-read scope when another transaction changes matching rows", async () => {
      const connection = await fixture.pool.connect();
      try {
        await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        const tx = {
          execute: (statement: SQL) => {
            const q = dialect.sqlToQuery(statement);
            return connection.query(q.sql, q.params);
          },
        };
        const initial = await resolveMemberSelectionIds(
          actor,
          selection(5000),
          tx,
        );
        expect(initial).toHaveLength(5000);
        await fixture.pool.query(
          "UPDATE memberships SET status='active' WHERE owner_user_id=$1",
          [prefix + ":05001"],
        );
        const repeated = await resolveMemberSelectionIds(
          actor,
          selection(5000),
          tx,
        );
        expect(new Set(repeated)).toEqual(new Set(initial));
        await connection.query("COMMIT");
        await expect(
          resolveMemberSelectionIds(actor, selection(5000), fixture.database),
        ).rejects.toThrow("BATCH_TOO_LARGE");
      } finally {
        await connection.query("ROLLBACK");
        connection.release();
        await fixture.pool.query(
          "UPDATE memberships SET status='expired' WHERE owner_user_id=$1",
          [prefix + ":05001"],
        );
      }
    }, 120000);
    it("records actual50/500/5000 SQL round trips and warm plans", async () => {
      const measurements: {
        size: number;
        sampleMs: number[];
        roundTrips: number[];
        warmSamples?: number;
        medianMs?: number;
        p95Ms?: number;
        plan?: unknown;
        completed: boolean;
      }[] = [];
      receipt.performance = measurements;
      for (const size of [50, 500, 5000] as const) {
        await fixture.pool.query(
          "ANALYZE profiles; ANALYZE memberships; ANALYZE company_members; ANALYZE companies",
        );
        const current = {
          size,
          sampleMs: [] as number[],
          roundTrips: [] as number[],
          completed: false,
        };
        measurements.push(current);
        for (let sample = 0; sample < 31; sample++) {
          const { tx, commands } = counted(fixture.database);
          const started = performance.now();
          const ids = await resolveMemberSelectionIds(
            actor,
            selection(size),
            tx,
          );
          const elapsed = performance.now() - started;
          expect(ids).toHaveLength(size);
          current.sampleMs.push(elapsed);
          current.roundTrips.push(commands.length);
          if (sample === 0) {
            const command = commands[0]!;
            measurements.at(-1)!.plan = safePlan(
              (
                await fixture.pool.query(
                  "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) " + command.sql,
                  command.params,
                )
              ).rows[0]["QUERY PLAN"],
            );
          }
          if (sample % 5 === 0) console.log("T13_SAMPLES", size, sample + 1);
        }
        const warm = current.sampleMs.slice(1).sort((a, b) => a - b),
          measured = measurements.at(-1)!;
        Object.assign(measured, {
          warmSamples: 30,
          medianMs: warm[14],
          p95Ms: warm[28],
          completed: true,
        });
      }
    }, 900000);
  },
);
