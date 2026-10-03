import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import type { SQL } from "drizzle-orm";
import type { Pool, Client } from "pg";

export type PerformanceTarget =
  { kind: "disposable" } | { kind: "neon"; connectionString: string };
const isolatedHost =
  "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech";
/** Refuse configured production databases before any connection or fixture write. */
export function resolvePerformanceTarget(
  target: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): PerformanceTarget {
  if (
    environment.NODE_ENV === "production" ||
    environment.VERCEL_ENV === "production"
  )
    throw new Error("PERFORMANCE_PRODUCTION_REFUSED");
  if (target === "disposable") return { kind: "disposable" };
  if (target !== "neon") throw new Error("PERFORMANCE_TARGET_UNAVAILABLE");
  const value = environment.DATABASE_URL_TEST;
  if (
    !value ||
    value !== environment.DATABASE_URL ||
    !["true", "1"].includes(environment.AUDIT_ISOLATED_ACCEPTANCE ?? "") ||
    environment.NEON_PROJECT_ID !== "solitary-wave-52860119"
  )
    throw new Error("PERFORMANCE_ISOLATION_UNCONFIRMED");
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("PERFORMANCE_TARGET_INVALID");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    parsed.hostname !== isolatedHost
  )
    throw new Error("PERFORMANCE_TARGET_INVALID");
  return { kind: "neon", connectionString: value };
}
const planKeys = new Set([
  "Node Type",
  "Join Type",
  "Strategy",
  "Actual Rows",
  "Actual Loops",
  "Actual Startup Time",
  "Actual Total Time",
  "Planning Time",
  "Execution Time",
  "Shared Hit Blocks",
  "Shared Read Blocks",
  "Temp Read Blocks",
  "Temp Written Blocks",
  "Plans",
  "Plan",
]);
function maskedPlan(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(maskedPlan);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => planKeys.has(key))
        .map(([key, item]) => [key, maskedPlan(item)]),
    );
  return value;
}
function statistics(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sampleCount: values.length,
    medianMs: (sorted[14]! + sorted[15]!) / 2,
    p95Ms: sorted[28]!,
    sampleMs: values,
  };
}
let stage = "guard";
async function run() {
  const targetArg =
    process.argv.find((arg) => arg.startsWith("--target="))?.slice(9) ??
    "disposable";
  const target = resolvePerformanceTarget(targetArg);
  const baseline = process.argv.includes("--baseline");
  if (baseline && target.kind !== "disposable")
    throw new Error("REMOTE_LEGACY_BENCHMARK_REFUSED");
  const output = resolve(
    process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) ??
      `docs/audits/hkwtia-2026-10-01-remediation/evidence/t21/${target.kind}-performance.json`,
  );
  const evidenceRoot = resolve(
    "docs/audits/hkwtia-2026-10-01-remediation/evidence/t21",
  );
  if (!output.startsWith(evidenceRoot + sep) || !output.endsWith(".json"))
    throw new Error("PERFORMANCE_OUTPUT_INVALID");
  stage = "module-loading";
  const [{ Pool, Client }, { PgDialect }, { adminMembersRepository }] =
    await Promise.all([
      import("pg"),
      import("drizzle-orm/pg-core"),
      import("../lib/db/repos/admin-members"),
    ]);
  const dialect = new PgDialect(),
    actor = {
      kind: "staff",
      profileId: "performance-staff",
      userId: "performance-staff",
    } as const;
  let pool: Pool, close: () => Promise<void>;
  stage = "database-fixture";
  if (target.kind === "disposable") {
    const { isolatedAuditDatabase } =
      await import("../tests/integration/audit-database-fixture");
    const fixture = await isolatedAuditDatabase();
    pool = fixture.pool;
    close = fixture.close;
  } else {
    pool = new Pool({
      connectionString: target.connectionString,
      query_timeout: 90000,
    });
    close = () => pool.end();
  }
  stage = "database-validation";
  const prefix = "t21-" + randomUUID();
  let fixtureWritten = false;
  const receipt: Record<string, unknown> = {
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    environment:
      target.kind === "disposable"
        ? "owned loopback PostgreSQL16; complete schema"
        : "confirmed isolated Neon ap-southeast-1; complete schema",
    production: false,
    providerEffects: 0,
    clientVantage: "Windows workstation; geographic location not established",
    node: process.version,
    startedAt: new Date().toISOString(),
    completed: false,
  };
  const measurements: Record<string, unknown>[] = [];
  receipt.measurements = measurements;
  const persist = () => {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify(receipt, null, 2) + "\n");
  };
  try {
    if (
      target.kind === "neon" &&
      Number(
        (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
          .rows[0].n,
      ) !== 1
    )
      throw new Error("PERFORMANCE_SENTINEL_MISSING");
    const ledger = Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
    );
    if (ledger !== 56) throw new Error("PERFORMANCE_LEDGER_MISMATCH");
    receipt.ledger = ledger;
    receipt.postgres = (
      await pool.query("SHOW server_version")
    ).rows[0].server_version;
    receipt.sourceFileHashes = Object.fromEntries(
      [
        "scripts/audit-remediation-performance.ts",
        "lib/db/repos/admin-members.ts",
        "lib/admin/batches/selection.ts",
      ].map((file) => [
        file,
        createHash("sha256").update(readFileSync(file)).digest("hex"),
      ]),
    );
    stage = "profile-fixture";
    await pool.query(
      "INSERT INTO profiles(id,auth_user_id,display_name,email,phone,job_title,locale,role) SELECT $1||':'||lpad(n::text,5,'0'),$1||':auth:'||n,$1||' synthetic '||n,$1||':'||n||'@synthetic.example.test','synthetic','Synthetic','en','member' FROM generate_series(1,5000) n",
      [prefix],
    );
    fixtureWritten = true;
    stage = "membership-fixture";
    await pool.query(
      "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_period_end) SELECT id,'startup','active',1,CASE WHEN right(id,5)::int<=50 THEN '2040-01-15T16:00Z'::timestamptz WHEN right(id,5)::int<=500 THEN '2040-02-15T16:00Z'::timestamptz ELSE '2040-03-15T16:00Z'::timestamptz END FROM profiles WHERE id LIKE $1",
      [prefix + ":%"],
    );
    await pool.query(
      "ANALYZE profiles; ANALYZE memberships; ANALYZE companies; ANALYZE company_members",
    );
    stage = "measurement";
    for (const size of [50, 500, 5000] as const) {
      const query = {
        search: prefix,
        status: ["active"],
        renewalTo:
          size === 50
            ? "2040-01-31"
            : size === 500
              ? "2040-02-29"
              : "2040-03-31",
      };
      for (const operation of [
        "snapshot",
        "list",
        ...(baseline ? ["legacy-paged-selection"] : []),
      ]) {
        const samples: number[] = [],
          roundTrips: number[] = [];
        let expectedIds: Set<string> | undefined;
        const item: Record<string, unknown> = {
          size,
          operation,
          completed: false,
        };
        measurements.push(item);
        persist();
        for (let sample = 0; sample < 31; sample++) {
          // A fresh connection is an independent client-cold sample, not a flushed DB/OS cache.
          let client: Client | undefined;
          const connected = performance.now();
          if (sample === 0) {
            client = new Client(pool.options);
            await client.connect();
          }
          const connectMs = performance.now() - connected;
          let count = 0,
            last: { sql: string; params: unknown[] } | undefined;
          const executor = {
            execute: (statement: SQL) => {
              count++;
              last = dialect.sqlToQuery(statement);
              return (client ?? pool).query(last.sql, last.params);
            },
          };
          const start = performance.now();
          let ids: string[];
          try {
            if (operation === "snapshot")
              ids = await adminMembersRepository.snapshotSelectionIds(
                actor,
                query,
                5000,
                executor,
              );
            else if (operation === "list")
              ids = (
                await adminMembersRepository.search(
                  actor,
                  { ...query, limit: 20 },
                  executor,
                )
              ).items.map((row) => row.profileId);
            else {
              ids = [];
              let cursor: string | undefined;
              do {
                const page = await adminMembersRepository.search(
                  actor,
                  { ...query, limit: 50, ...(cursor ? { cursor } : {}) },
                  executor,
                );
                ids.push(...page.items.map((row) => row.profileId));
                cursor = page.nextCursor ?? undefined;
              } while (cursor);
            }
            const elapsed = performance.now() - start,
              expected = operation === "list" ? Math.min(size, 20) : size;
            if (
              ids.length !== expected ||
              new Set(ids).size !== expected ||
              ids.some((id) => !id.startsWith(prefix + ":"))
            )
              throw new Error("PERFORMANCE_SELECTION_SCOPE_FAILED");
            if (operation === "snapshot" && sample === 0)
              expectedIds = new Set(ids);
            if (expectedIds && ids.some((id) => !expectedIds!.has(id)))
              throw new Error("PERFORMANCE_SELECTION_CHANGED");
            if (sample === 0) {
              item.clientCold = {
                connectMs,
                queryMs: elapsed,
                roundTrips: count,
                definition:
                  "new pool client; seeded DB buffers are warm; connect includes DNS/TCP/TLS/auth when remote, not pure TLS",
              };
              if (last)
                item.plan = maskedPlan(
                  (
                    await (client ?? pool).query(
                      "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) " + last.sql,
                      last.params,
                    )
                  ).rows[0]["QUERY PLAN"],
                );
            } else {
              samples.push(elapsed);
              roundTrips.push(count);
            }
          } finally {
            await client?.end();
          }
          if (sample % 5 === 0) {
            console.log(
              JSON.stringify({
                target: target.kind,
                size,
                operation,
                samplesCompleted: sample + 1,
              }),
            );
            persist();
          }
        }
        Object.assign(item, statistics(samples), {
          roundTrips,
          errorRate: 0,
          completed: true,
        });
        persist();
      }
    }
    receipt.completed = true;
    receipt.finishedAt = new Date().toISOString();
    persist();
  } catch (error: unknown) {
    const detail = error as { name?: string; code?: string; stack?: string };
    receipt.failure = {
      code: "PERFORMANCE_RUN_INCOMPLETE",
      stage,
      errorType: detail.name,
      errorCode: detail.code ?? null,
      frames: detail.stack?.split("\n").slice(1, 6),
    };
    persist();
    throw new Error("PERFORMANCE_RUN_INCOMPLETE");
  } finally {
    try {
      if (fixtureWritten) {
        await pool.query(
          "DELETE FROM memberships WHERE owner_user_id LIKE $1",
          [prefix + ":%"],
        );
        await pool.query(
          "DELETE FROM profiles WHERE id LIKE $1 AND email LIKE '%@synthetic.example.test'",
          [prefix + ":%"],
        );
        receipt.ownedFixtureCleanup = true;
        persist();
      }
    } finally {
      await close();
    }
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  run().catch((error: unknown) => {
    const detail = error as { name?: string; code?: string; stack?: string };
    console.error(
      JSON.stringify({
        result: "PERFORMANCE_GATE_FAILED",
        stage,
        errorType: detail.name ?? "Error",
        errorCode: detail.code ?? null,
        frames: detail.stack?.split("\n").slice(1, 6),
      }),
    );
    process.exitCode = 1;
  });
