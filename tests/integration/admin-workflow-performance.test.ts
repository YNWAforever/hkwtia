// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { randomUUID, createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { isolatedAuditDatabase } from "./audit-database-fixture";
import { listInbox } from "@/lib/admin/inbox";
import { createInboxRepository } from "@/lib/db/repos/inbox";
import { adminMembersRepository } from "@/lib/db/repos/admin-members";
import { reportsRepository } from "@/lib/db/repos/reports";
import { createAiDraftsRepository } from "@/lib/db/repos/ai-drafts";
import type { KbDatabaseLoader } from "@/lib/db/repos/kb-documents";
import type { AdminMemberQuery } from "@/lib/admin/member-query";
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
let measured: ReturnType<typeof instrument>;
vi.mock("@/lib/db/repos/common", () => ({
  getDb: async () => measured.database,
}));
const actor = {
  kind: "staff",
  profileId: "t15-staff",
  userId: "t15-auth-staff",
} as const;
const evidence = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t15/";
const measurements: object[] = [];
const dialect = new PgDialect();
function instrument() {
  const commands: {
    sql: string;
    params: unknown[];
    rows: number;
    ms: number;
    bytes: number;
  }[] = [];
  const wrap = (db: { execute: (query: SQL) => Promise<unknown> }) => ({
    execute: async (query: SQL) => {
      const command = dialect.sqlToQuery(query),
        start = performance.now(),
        result = await db.execute(query);
      const rows = (result as { rows: unknown[] }).rows;
      commands.push({
        ...command,
        rows: rows.length,
        ms: performance.now() - start,
        bytes: Buffer.byteLength(JSON.stringify(rows)),
      });
      return result;
    },
  });
  const database = {
    ...wrap(f.database),
    transaction: <T>(work: (tx: ReturnType<typeof wrap>) => Promise<T>) =>
      f.database.transaction((tx) => work(wrap(tx))),
  };
  return { database, commands };
}
const pct = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.max(0, Math.ceil(values.length * p) - 1)
  ]!;
async function sample(
  name: string,
  count: number,
  read: () => Promise<unknown>,
  maxRows: number,
) {
  const durations: number[] = [],
    payloads: number[] = [],
    heaps: number[] = [],
    queries: number[] = [];
  for (let n = 0; n < 20; n++) {
    measured.commands.length = 0;
    const start = performance.now(),
      heap = process.memoryUsage().heapUsed,
      result = await read();
    durations.push(performance.now() - start);
    payloads.push(Buffer.byteLength(JSON.stringify(result)));
    heaps.push(process.memoryUsage().heapUsed - heap);
    queries.push(measured.commands.length);
    expect(
      Math.max(...measured.commands.map((c) => c.rows)),
    ).toBeLessThanOrEqual(maxRows);
  }
  const commands = [...measured.commands];
  const command = commands.find((c) => /^\s*(WITH|SELECT d\.id)/u.test(c.sql));
  let explain: object | null = null;
  if (command) {
    const plan = (
      await f.pool.query(
        "EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) " + command.sql,
        command.params,
      )
    ).rows[0]["QUERY PLAN"][0];
    explain = {
      planningMs: plan["Planning Time"],
      executionMs: plan["Execution Time"],
      node: plan.Plan["Node Type"],
      actualRows: plan.Plan["Actual Rows"],
      sharedHitBlocks: plan.Plan["Shared Hit Blocks"],
      sharedReadBlocks: plan.Plan["Shared Read Blocks"],
      plan: plan.Plan,
    };
  }
  const p95 = pct(durations, 0.95);
  measurements.push({
    operationId: randomUUID(),
    name,
    count,
    samples: 20,
    p95Ms: p95,
    minMs: Math.min(...durations),
    maxMs: Math.max(...durations),
    queryCounts: [...new Set(queries)],
    maxTransferredRows: Math.max(...commands.map((c) => c.rows)),
    maxPayloadBytes: Math.max(...payloads),
    heapDeltaBytes: {
      min: Math.min(...heaps),
      max: Math.max(...heaps),
      includesGcAndProcessNoise: true,
    },
    explain,
  });
  expect(
    p95,
    "loopback repository p95; excludes Auth/HTTP/TLS/region/RUM",
  ).toBeLessThanOrEqual(1000);
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "T15 actual full-schema synthetic administrative scale",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
      measured = instrument();
      expect(
        Number(
          (
            await f.pool.query(
              "SELECT count(*) n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        ),
      ).toBe(61);
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,email,role) VALUES('t15-staff','t15-auth-staff','Acceptance operator','staff@example.test','staff')",
      );
    }, 120000);
    afterAll(async () => {
      mkdirSync(evidence, { recursive: true });
      writeFileSync(
        evidence +
          "repository-scale-" +
          (process.env.FULL_FIX_MEASUREMENT_PHASE ?? "baseline") +
          ".json",
        JSON.stringify(
          {
            sourceSha: process.env.FULL_FIX_EXPECTED_SOURCE_SHA ?? null,
            measuredSqlSourceSha256: createHash("sha256")
              .update(readFileSync("lib/db/repos/admin-members.ts"))
              .digest("hex"),
            environment:
              "owned disposable loopback pgvector PostgreSQL16; all61 migrations; Node " +
              process.version,
            syntheticOnly: true,
            externalEffects: 0,
            production: false,
            coldDatabase: false,
            regionalPerformanceVerified: false,
            rumVerified: false,
            operationIdScope:
              "measurement request and SQL only; actual model/provider receipt requires its separate authorized acceptance",
            measurements,
          },
          null,
          2,
        ),
      );
      if (f) await f.close();
    });
    for (const count of [1000, 10000]) {
      it(
        count +
          " synthetic profiles: seed and measure search, keyset and aggregate report",
        async () => {
          await f.pool.query(
            "INSERT INTO profiles(id,auth_user_id,display_name,email,locale,job_title,phone,created_at) SELECT 't15-'||lpad(n::text,6,'0'),'t15-auth-'||n,'Synthetic '||lpad(n::text,6,'0'),'scale-'||n||'@example.test',CASE WHEN n%2=0 THEN 'en' ELSE 'zh-HK' END,CASE WHEN n%3=0 THEN '' ELSE 'Synthetic job' END,CASE WHEN n%3=0 THEN NULL ELSE '+85200000000' END,'2039-01-01' FROM generate_series($1::int,$2::int)n",
            [count === 1000 ? 1 : 1001, count],
          );
          await f.pool.query(
            "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_interval,billing_period_end,created_at) SELECT id,CASE WHEN substring(id FROM 5)::int%2=0 THEN 'startup'::membership_plan_code ELSE 'community'::membership_plan_code END,CASE WHEN substring(id FROM 5)::int%4=0 THEN 'past_due'::membership_status ELSE 'active'::membership_status END,1,'annual','2040-02-01','2039-01-01' FROM profiles p WHERE id<>'t15-staff' AND NOT EXISTS(SELECT 1 FROM memberships m WHERE m.owner_user_id=p.id)",
          );
          await f.pool.query("ANALYZE profiles; ANALYZE memberships");
          await sample(
            "member-list-first50",
            count,
            () =>
              adminMembersRepository.search(
                actor,
                { search: "Synthetic", limit: 50 },
                measured.database,
              ),
            51,
          );
          await sample(
            "member-search-locale-status-plan",
            count,
            () =>
              adminMembersRepository.search(
                actor,
                {
                  search: "Synthetic",
                  status: ["past_due"],
                  planCode: ["startup"],
                  locale: "en",
                  limit: 50,
                },
                measured.database,
              ),
            51,
          );
          await sample(
            "board-report-aggregate",
            count,
            () =>
              reportsRepository.readFacts(actor, {
                from: new Date("2039-01-01"),
                toExclusive: new Date("2040-03-01"),
                asOf: new Date("2040-01-01"),
              }),
            1,
          );
        },
        60000,
      );
      const filters: Partial<AdminMemberQuery>[] = [
        {},
        { status: ["past_due"] },
        { status: ["active"], planCode: ["community"] },
        { locale: "zh-HK" },
        { completeness: "complete" },
        { completeness: "incomplete" },
        { renewalFrom: "2040-02-01", renewalTo: "2040-02-01" },
      ];
      const pages = filters
        .map((filter, index) => ({
          filter,
          sort: "name_asc" as const,
          name: "filter-" + index,
        }))
        .concat([]);
      const scenarios: {
        filter: Partial<AdminMemberQuery>;
        sort: "name_asc" | "name_desc" | "renewal_asc";
        name: string;
      }[] = [
        ...pages,
        { filter: {}, sort: "name_desc", name: "descending" },
        { filter: {}, sort: "renewal_asc", name: "renewal" },
      ];
      for (const { filter, sort, name } of scenarios)
        it(
          count +
            " profiles: " +
            name +
            " keyset has no omissions or duplicates",
          async () => {
            const expected = Array.from({ length: count }, (_, i) => i + 1)
              .filter(
                (n) =>
                  (!filter.status ||
                    filter.status.includes(
                      n % 4 === 0 ? "past_due" : "active",
                    )) &&
                  (!filter.planCode ||
                    filter.planCode.includes(
                      n % 2 === 0 ? "startup" : "community",
                    )) &&
                  (!filter.locale ||
                    filter.locale === (n % 2 === 0 ? "en" : "zh-HK")) &&
                  (!filter.completeness ||
                    (filter.completeness === "complete"
                      ? n % 3 !== 0
                      : n % 3 === 0)),
              )
              .map((n) => "t15-" + String(n).padStart(6, "0"));
            if (sort === "name_desc") expected.reverse();
            const ids: string[] = [];
            let cursor: string | null = null;
            do {
              const page = await adminMembersRepository.search(
                actor,
                { search: "Synthetic", ...filter, sort, limit: 50, cursor },
                measured.database,
              );
              expect(page.items.length).toBeLessThanOrEqual(50);
              ids.push(...page.items.map((p) => p.profileId));
              cursor = page.nextCursor;
            } while (cursor);
            expect(ids).toEqual(expected);
            expect(new Set(ids).size).toBe(ids.length);
          },
          60000,
        );
      it(
        count +
          " synthetic drafts: bounded queue, filters, current actor and keyset coverage",
        async () => {
          await f.pool.query(
            "INSERT INTO agent_runs(agent,trigger,profile_id) SELECT 'board_reporter','scheduled',p.id FROM profiles p WHERE id<>'t15-staff' AND NOT EXISTS(SELECT 1 FROM agent_runs r WHERE r.profile_id=p.id)",
          );
          await f.pool.query(
            "INSERT INTO ai_review_drafts(kind,case_id,locale,facts_hash,owner_profile_id,due_at,source_refs,claims,body,rendered_body,state,violations,model_route,prompt_version,run_id) SELECT (ARRAY['application','support','renewal','board','content'])[substring(r.profile_id FROM 5)::int%5+1],r.profile_id,'en',repeat('a',64),CASE WHEN substring(r.profile_id FROM 5)::int%2=0 THEN 't15-staff' ELSE NULL END,'2040-01-01','[]','[]','Synthetic draft','Synthetic draft',CASE WHEN substring(r.profile_id FROM 5)::int%2=0 THEN 'needs_review' ELSE 'proposed' END,'[]','synthetic-offline','t15-fixture',r.id FROM agent_runs r WHERE NOT EXISTS(SELECT 1 FROM ai_review_drafts d WHERE d.run_id=r.id)",
          );
          await f.pool.query("ANALYZE ai_review_drafts");
          // The wrapper executes the real Drizzle transaction and SQL; the cast only bridges its unused schema metadata.
          const repo = createAiDraftsRepository(
            async () =>
              measured.database as unknown as Awaited<
                ReturnType<KbDatabaseLoader>
              >,
          );
          await sample(
            "draft-queue-first50",
            count,
            () => repo.listReviewQueue(actor, { limit: 50 }),
            51,
          );
          const filters = [
            {},
            { kind: "renewal" as const },
            { state: "needs_review" as const },
            { ownerId: actor.profileId },
            { dueBefore: "2040-01-01T00:00:00Z" },
            { kind: "content" as const, state: "proposed" as const },
          ];
          for (const filter of filters) {
            const expected = (
              await f.pool.query(
                "SELECT id::text FROM ai_review_drafts WHERE ($1::text IS NULL OR kind=$1) AND ($2::text IS NULL OR state=$2) AND ($3::text IS NULL OR owner_profile_id=$3) AND ($4::timestamptz IS NULL OR due_at<=$4) ORDER BY id",
                [
                  "kind" in filter ? filter.kind : null,
                  "state" in filter ? filter.state : null,
                  "ownerId" in filter ? filter.ownerId : null,
                  "dueBefore" in filter ? filter.dueBefore : null,
                ],
              )
            ).rows.map((r) => r.id);
            const ids: string[] = [];
            let after: string | undefined;
            do {
              const page = await repo.listReviewQueue(actor, {
                ...filter,
                limit: 50,
                after,
              });
              expect(page.items.length).toBeLessThanOrEqual(50);
              ids.push(...page.items.map((d) => d.id));
              after = page.nextCursor ?? undefined;
            } while (after);
            expect(ids).toEqual(expected);
            expect(new Set(ids).size).toBe(ids.length);
          }
          const first = await repo.listReviewQueue(actor, {
            kind: "renewal",
            limit: 1,
          });
          expect(first.nextCursor).toBeTruthy();
          await expect(
            repo.listReviewQueue(actor, {
              kind: "support",
              after: first.nextCursor!,
            }),
          ).rejects.toThrow();
          await expect(
            repo.listReviewQueue(
              { ...actor, userId: "spoofed" },
              { limit: 50 },
            ),
          ).rejects.toThrow();
        },
        60000,
      );
    }
    it("50-row defaults and 100-row inbox cap are enforced by actual repositories", async () => {
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,email) SELECT 't15-900'||lpad(n::text,3,'0'),'t15-bound-auth-'||n,'Default capacity sample','bounds-'||n||'@example.test' FROM generate_series(1,55)n",
      );
      expect(
        (
          await adminMembersRepository.search(
            actor,
            { search: "Default capacity sample" },
            measured.database,
          )
        ).items,
      ).toHaveLength(50);
    });
    it("default draft review queue returns50 of55 actual drafts", async () => {
      await f.pool.query(
        "INSERT INTO agent_runs(agent,trigger,profile_id) SELECT 'board_reporter','scheduled',p.id FROM profiles p WHERE id LIKE 't15-900%'",
      );
      await f.pool.query(
        "INSERT INTO ai_review_drafts(kind,case_id,locale,facts_hash,owner_profile_id,source_refs,claims,body,rendered_body,state,violations,model_route,prompt_version,run_id) SELECT 'application',r.profile_id,'en',repeat('a',64),'t15-staff','[]','[]','Synthetic default queue','Synthetic default queue','needs_review','[]','synthetic-offline','t15-fixture',r.id FROM agent_runs r WHERE profile_id LIKE 't15-900%'",
      );
      const repo = createAiDraftsRepository(
        async () =>
          measured.database as unknown as Awaited<ReturnType<KbDatabaseLoader>>,
      );
      expect((await repo.listReviewQueue(actor)).items).toHaveLength(50);
    });
    it("inbox UI defaults to50 actual conversations", async () => {
      await f.pool.query(
        "INSERT INTO conversations(profile_id,expires_at,last_message_at) SELECT id,'2050-01-01','2040-01-01' FROM profiles WHERE id LIKE 't15-900%'",
      );
      expect(await listInbox(actor, "all")).toHaveLength(50);
    });
    it("inbox refuses a request above100 rows before querying", async () => {
      // The fixture's real Drizzle executor is used; its unused schema typing differs from Neon.
      const repo = createInboxRepository(async () => f.database as never);
      await expect(
        repo.listConversations(actor, { limit: 101 }),
      ).rejects.toThrow();
    });
    it("set visibility preserves personal and company memberships, active seats, revoked-seat exclusion and matching membership IDs", async () => {
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,email) VALUES('owner','owner-auth','Visibility owner','owner@example.test'),('seat','seat-auth','Visibility seat','seat@example.test'),('revoked','revoked-auth','Visibility revoked','revoked@example.test')",
      );
      const company = randomUUID(),
        owned = randomUUID(),
        shared = randomUUID();
      await f.pool.query(
        "INSERT INTO companies(id,legal_name,display_name) VALUES($1,'Synthetic visibility company','Synthetic visibility company')",
        [company],
      );
      await f.pool.query(
        "INSERT INTO company_members(company_id,user_id,role,revoked_at) VALUES($1,'owner','member',NULL),($1,'seat','member',NULL),($1,'revoked','member',now())",
        [company],
      );
      await f.pool.query(
        "INSERT INTO memberships(id,company_id,owner_user_id,plan_code,status,seat_limit) VALUES($1,NULL,'owner','startup','active',1),($2,$3,NULL,'corporate','past_due',5)",
        [owned, shared, company],
      );
      const page = await adminMembersRepository.search(
        actor,
        { search: "Visibility", status: ["active", "past_due"] },
        measured.database,
      );
      expect(page.items.map((p) => p.profileId).sort()).toEqual([
        "owner",
        "seat",
      ]);
      expect(
        [
          ...page.items.find((p) => p.profileId === "owner")!
            .matchingMembershipIds,
        ].sort(),
      ).toEqual([owned, shared].sort());
      expect(
        page.items.find((p) => p.profileId === "seat")!.matchingMembershipIds,
      ).toEqual([shared]);
      const pastDue = await adminMembersRepository.search(
        actor,
        { companyId: company, status: ["past_due"] },
        measured.database,
      );
      expect(pastDue.items).toHaveLength(2);
      expect(pastDue.items.every((p) => p.membershipId === shared)).toBe(true);
      await f.pool.query(
        "UPDATE company_members SET revoked_at=now() WHERE user_id='owner'",
      );
      const remaining = await adminMembersRepository.search(
        actor,
        { search: "Visibility", status: ["active", "past_due"] },
        measured.database,
      );
      expect(remaining.items.map((p) => p.profileId).sort()).toEqual([
        "owner",
        "seat",
      ]);
      expect(
        remaining.items.find((p) => p.profileId === "owner")
          ?.matchingMembershipIds,
      ).toEqual([owned]);
    });
  },
);
