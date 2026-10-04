// @vitest-environment node
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { describe, expect, it, vi } from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/common")>()),
  getDb: async () => state.database,
}));
import {
  readCopyWorkspace,
  saveCopyDraft,
  publishCopyDraft,
  listPageCopyForLocale,
} from "@/lib/db/repos/page-copy";
const dir = "docs/audits/hkwtia-2026-10-03-full-fix/evidence/t16";
const currentJournal = JSON.parse(
  readFileSync("drizzle/meta/_journal.json", "utf8"),
) as { entries: { idx: number; tag: string }[] };
const expectedLedger = currentJournal.entries.length;
const receipt: Record<string, unknown> = {
  sourceSha: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  workingTree: true,
  testAndFixtureSha256: Object.fromEntries(
    [
      "tests/integration/audit-full-migration-recovery.test.ts",
      "tests/integration/audit-database-fixture.ts",
    ].map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  ),
  environment:
    "owned disposable PostgreSQL16; full actual migrator/repositories",
  production: false,
  providerEffects: 0,
  cases: [],
};
function record(value: Record<string, unknown>) {
  (receipt.cases as Record<string, unknown>[]).push(value);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    dir + "/migration-recovery.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
}
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "full clean and baseline migration recovery",
  () => {
    it("migrates a clean database and repeats without losing additive schema or ledger", async () => {
      expect(expectedLedger).toBeGreaterThanOrEqual(61);
      const f = await isolatedAuditDatabase();
      try {
        const ledger = () =>
          f.pool.query(
            "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
          );
        expect((await ledger()).rows[0].n).toBe(expectedLedger);
        await f.migrateRemaining();
        await f.migrateRemaining();
        expect((await ledger()).rows[0].n).toBe(expectedLedger);
        const tables = (
          await f.pool.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name=ANY($1) ORDER BY table_name",
            [["job_health", "page_copy_drafts"]],
          )
        ).rows.map((row) => row.table_name);
        expect(tables).toEqual(["job_health", "page_copy_drafts"]);
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS n FROM pg_enum WHERE enumtypid='event_order_status'::regtype AND enumlabel='refund_pending'",
            )
          ).rows[0].n,
        ).toBe(1);
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname='public' AND indexname=ANY($1)",
              [
                [
                  "memberships_renewal_window_idx",
                  "journey_state_renewal_episode_unique",
                  "page_copy_one_open_draft",
                ],
              ],
            )
          ).rows[0].n,
        ).toBe(3);
        record({
          case: "clean",
          ledger: expectedLedger,
          repeatedMigrations: 2,
          requiredTables: tables,
          refundPendingRetained: true,
          indexes: 3,
          pass: true,
        });
      } finally {
        await f.close();
      }
    }, 120000);
    it("rolls back an interrupted baseline upgrade, then preserves historical rights, paid transactions and CMS history across compatible rollback", async () => {
      const f = await isolatedAuditDatabase(51),
        event = randomUUID(),
        order = randomUUID(),
        root = resolve(".tmp"),
        tempRoot = join(root, "migration-recovery-");
      let temporary: string | undefined;
      try {
        state.database = f.database;
        vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "true");
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        ).toBe(51);
        await f.pool.query(
          "INSERT INTO profiles(id,auth_user_id,display_name,email,role) VALUES ('recovery-member','recovery-auth-member','Synthetic recovery member','recovery@example.test','member'),('recovery-staff','recovery-auth-staff','Synthetic recovery staff','recovery-staff@example.test','staff')",
        );
        await f.pool.query(
          "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_interval) VALUES ('recovery-member','community','active',1,'none')",
        );
        await f.pool.query(
          "INSERT INTO events(id,slug,title_en,description_en,starts_at,published,status) VALUES($1,'synthetic-recovery-event','Synthetic recovery event','Synthetic','2040-01-01',true,'published')",
          [event],
        );
        await f.pool.query(
          "INSERT INTO event_orders(id,event_id,buyer_profile_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,status,idempotency_key,expires_at,paid_at) VALUES($1,$2,'recovery-member','Synthetic recovery member','recovery@example.test','en',1000,'paid','synthetic-recovery-order','2040-01-01',now())",
          [order, event],
        );
        const fingerprint = async () =>
          createHash("sha256")
            .update(
              JSON.stringify(
                (
                  await f.pool.query(
                    "SELECT jsonb_build_object('profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM profiles p),'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM memberships m),'orders',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM event_orders o)) AS data",
                  )
                ).rows[0].data,
              ),
            )
            .digest("hex");
        const before = await fingerprint();
        mkdirSync(root, { recursive: true });
        temporary = mkdtempSync(tempRoot);
        mkdirSync(join(temporary, "meta"));
        const journal = JSON.parse(
          readFileSync("drizzle/meta/_journal.json", "utf8"),
        ) as { entries: { idx: number; tag: string }[] };
        writeFileSync(
          join(temporary, "meta/_journal.json"),
          JSON.stringify(journal),
        );
        for (const entry of journal.entries) {
          const filename = entry.tag + ".sql";
          copyFileSync(join("drizzle", filename), join(temporary, filename));
          if (entry.idx === currentJournal.entries.at(-1)!.idx)
            writeFileSync(
              join(temporary, filename),
              readFileSync(join(temporary, filename), "utf8") +
                "\n--> statement-breakpoint\nSELECT deliberate_migration_interrupt;\n",
            );
        }
        // Intentional SQL fault after final DDL demonstrates transaction rollback, not a product regression.
        await expect(
          migrate(f.database, { migrationsFolder: temporary }),
        ).rejects.toThrow();
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        ).toBe(51);
        expect(await fingerprint()).toBe(before);
        expect(
          (
            await f.pool.query(
              "SELECT to_regclass('public.job_health') AS health,to_regclass('public.page_copy_drafts') AS drafts",
            )
          ).rows[0],
        ).toEqual({ health: null, drafts: null });
        await f.migrateRemaining();
        await f.migrateRemaining();
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        ).toBe(expectedLedger);
        expect(await fingerprint()).toBe(before);
        expect(
          (
            await f.pool.query(
              "SELECT grant_effective_at,grant_expires_at FROM memberships WHERE owner_user_id='recovery-member'",
            )
          ).rows[0],
        ).toEqual({ grant_effective_at: null, grant_expires_at: null });
        // An older additive SQL projection can still read paid rows and write historical NULL/NULL grants.
        await f.pool.query(
          "INSERT INTO profiles(id,auth_user_id,display_name) VALUES('recovery-old-writer','recovery-old-auth','Synthetic older writer')",
        );
        await f.pool.query(
          "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit) VALUES('recovery-old-writer','community','active',1)",
        );
        expect(
          (
            await f.pool.query(
              "SELECT status,amount_hkd_cents FROM event_orders WHERE id=$1",
              [order],
            )
          ).rows[0],
        ).toEqual({ status: "paid", amount_hkd_cents: 1000 });
        const actor = {
            kind: "staff",
            profileId: "recovery-staff",
            userId: "recovery-auth-staff",
          } as const,
          w = await readCopyWorkspace(actor, "Home"),
          d = await saveCopyDraft(actor, {
            namespace: "Home",
            baseRevision: w.revision,
            expectedDraftRevision: null,
            changes: { "en:hero.title": "Synthetic retained publication" },
          });
        await publishCopyDraft(actor, {
          draftId: d.draftId,
          expectedDraftRevision: d.revision,
          expectedPublishedRevision: d.publishedRevision,
        });
        const historyBefore = (
          await f.pool.query(
            "SELECT count(*)::int AS n FROM page_copy_drafts WHERE published_at IS NOT NULL",
          )
        ).rows[0].n;
        expect(historyBefore).toBe(1);
        vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "false");
        expect(await listPageCopyForLocale("en")).toContainEqual(
          expect.objectContaining({ value: "Synthetic retained publication" }),
        );
        await expect(
          saveCopyDraft(actor, {
            namespace: "Home",
            baseRevision: w.revision,
            expectedDraftRevision: null,
            changes: { "en:hero.title": "Synthetic blocked" },
          }),
        ).rejects.toThrow();
        expect(
          (
            await f.pool.query(
              "SELECT count(*)::int AS n FROM page_copy_drafts WHERE published_at IS NOT NULL",
            )
          ).rows[0].n,
        ).toBe(historyBefore);
        record({
          case: "baseline51",
          interruptionRolledBackTo: 51,
          repeatedUpgradeLedger: expectedLedger,
          preexistingFinancialAndRightsFingerprintUnchanged: true,
          historicalNullNullRightsRetained: true,
          olderSqlProjectionCompatible: true,
          retainedCmsHistory: historyBefore,
          flagOffNewDraftWriteDenied: true,
          publicReadRetained: true,
          scope:
            "SQL compatibility and gated new writer; not an arbitrary old app/inbox writer or deployed rollback",
          pass: true,
        });
      } finally {
        vi.unstubAllEnvs();
        if (temporary) {
          if (!resolve(temporary).startsWith(root + sep))
            throw new Error("RECOVERY_DIRECTORY_INVALID");
          rmSync(temporary, { recursive: true, force: true });
        }
        await f.close();
      }
    }, 180000);
    it("restores baseline56 backup, upgrades to current ledger, preserves unknown effects through another restore and executes actual historical repository reads/writes", async () => {
      const f = await isolatedAuditDatabase(56),
        event = randomUUID(),
        order = randomUUID();
      let baseline: Awaited<ReturnType<typeof f.backupAndRestore>> | undefined;
      let current: Awaited<ReturnType<typeof f.backupAndRestore>> | undefined;
      const root = resolve(".tmp");
      mkdirSync(root, { recursive: true });
      const oldPath = join(
        root,
        "recovery-old-page-copy-" + randomUUID() + ".ts",
      );
      try {
        await f.pool.query(
          "INSERT INTO profiles(id,auth_user_id,display_name,email,role) VALUES ('restore-member','restore-auth-member','Synthetic restore member','restore@example.test','member'),('restore-staff','restore-auth-staff','Synthetic restore staff','restore-staff@example.test','staff')",
        );
        await f.pool.query(
          "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_interval) VALUES('restore-member','community','active',1,'none')",
        );
        await f.pool.query(
          "INSERT INTO events(id,slug,title_en,description_en,starts_at,published,status) VALUES($1,'synthetic-restore-event','Synthetic restore event','Synthetic','2040-01-01',true,'published')",
          [event],
        );
        await f.pool.query(
          "INSERT INTO event_orders(id,event_id,buyer_profile_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,status,idempotency_key,expires_at,paid_at) VALUES($1,$2,'restore-member','Synthetic restore member','restore@example.test','en',1000,'paid','synthetic-restore-order','2040-01-01',now())",
          [order, event],
        );
        await f.pool.query(
          "INSERT INTO ticket_email_outbox(order_id,kind,status,event_key,attempt_count,provider_id,error_code) VALUES($1,'confirmation','uncertain','synthetic-restore-confirmation',1,'synthetic-provider-accepted','UNKNOWN_EFFECT')",
          [order],
        );
        await f.pool.query(
          "INSERT INTO audit_events(actor_user_id,actor_type,action,target_type,target_id) VALUES('restore-staff','staff','synthetic.recovery','event_order',$1)",
          [order],
        );
        const fingerprint = async (pool: Pool, tables: string[]) => {
          const data = [];
          for (const table of tables) {
            if (!/^[a-z_]+$/.test(table)) throw Error("INVALID_RECOVERY_TABLE");
            const rows = await pool.query(
              `SELECT to_jsonb(t) AS value FROM ${table} t ORDER BY id`,
            );
            data.push([table, rows.rows]);
          }
          return createHash("sha256")
            .update(JSON.stringify(data))
            .digest("hex");
        };
        const core = [
          "profiles",
          "memberships",
          "event_orders",
          "ticket_email_outbox",
          "audit_events",
        ];
        const original = await fingerprint(f.pool, core);
        baseline = await f.backupAndRestore();
        expect(baseline.backupBytes).toBeGreaterThan(10000);
        expect(await fingerprint(baseline.pool, core)).toBe(original);
        expect(
          (
            await baseline.pool.query(
              "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        ).toBe(56);
        await migrate(baseline.database, { migrationsFolder: "drizzle" });
        await migrate(baseline.database, { migrationsFolder: "drizzle" });
        expect(
          (
            await baseline.pool.query(
              "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
            )
          ).rows[0].n,
        ).toBe(expectedLedger);
        expect(await fingerprint(baseline.pool, core)).toBe(original);
        // Budget/claim state has a deliberately expired lease, but the unknown external effect stays held.
        await f.migrateRemaining();
        await f.pool.query(
          "INSERT INTO ai_budget_reservations(run_key,scope,max_microusd,charged_microusd,usage_state,pricing_version,expires_at,dispatched_at,accepted_at,provider_request_id,created_at,updated_at) VALUES($1,'support',1000,1000,'unknown','synthetic-test-pricing',now()-interval '1 hour',now()-interval '2 hours',now()-interval '2 hours','synthetic-accepted',now()-interval '3 hours',now())",
          [randomUUID()],
        );
        const run = randomUUID();
        await f.pool.query(
          "INSERT INTO ai_draft_work(run_id,kind,case_id,facts_hash,agent_version,idempotency_key,state,claim_token,lease_until,request_started_at,provider_request_id) VALUES($1,'support','synthetic-restore-case',$2,'synthetic-test-agent','synthetic-restore-key','unknown',$3,now()-interval '1 hour',now()-interval '2 hours','synthetic-accepted')",
          [run, "a".repeat(64), randomUUID()],
        );
        const budgetBefore = (
          await f.pool.query(
            "SELECT to_jsonb(t) AS data FROM ai_budget_reservations t ORDER BY id",
          )
        ).rows;
        const claimsBefore = (
          await f.pool.query(
            "SELECT to_jsonb(t) AS data FROM ai_draft_work t ORDER BY run_id",
          )
        ).rows;
        current = await f.backupAndRestore();
        state.database = current.database;
        expect(await fingerprint(current.pool, core)).toBe(original);
        expect(
          (
            await current.pool.query(
              "SELECT to_jsonb(t) AS data FROM ai_budget_reservations t ORDER BY id",
            )
          ).rows,
        ).toEqual(budgetBefore);
        expect(
          (
            await current.pool.query(
              "SELECT to_jsonb(t) AS data FROM ai_draft_work t ORDER BY run_id",
            )
          ).rows,
        ).toEqual(claimsBefore);
        const ledger = (
          await f.pool.query(
            "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
          )
        ).rows;
        expect(
          (
            await current.pool.query(
              "SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at",
            )
          ).rows,
        ).toEqual(ledger);
        const historicalSha = "36ebae1dac68a7e0e420870cf0df68fa166b7874";
        const historical = execFileSync(
          "git",
          ["show", historicalSha + ":lib/db/repos/page-copy.ts"],
          { encoding: "utf8" },
        );
        writeFileSync(oldPath, historical);
        // Vitest loads the exact historical module, not a hand-written SQL projection.
        const old = (await import(
          /* @vite-ignore */ oldPath
        )) as typeof import("@/lib/db/repos/page-copy");
        const actor = {
          kind: "staff",
          profileId: "restore-staff",
          userId: "restore-auth-staff",
        } as const;
        vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "true");
        const workspace = await old.readCopyWorkspace(actor, "Home");
        const draft = await old.saveCopyDraft(actor, {
          namespace: "Home",
          baseRevision: workspace.revision,
          expectedDraftRevision: null,
          changes: {
            "en:hero.title": "Synthetic historical compatible publication",
          },
        });
        await old.publishCopyDraft(actor, {
          draftId: draft.draftId,
          expectedDraftRevision: draft.revision,
          expectedPublishedRevision: draft.publishedRevision,
        });
        expect(await listPageCopyForLocale("en")).toContainEqual(
          expect.objectContaining({
            value: "Synthetic historical compatible publication",
          }),
        );
        vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "false");
        await expect(
          old.saveCopyDraft(actor, {
            namespace: "Home",
            baseRevision: workspace.revision,
            expectedDraftRevision: null,
            changes: { "en:hero.title": "Synthetic blocked old writer" },
          }),
        ).rejects.toThrow("CMS_DRAFTS_DISABLED");
        expect(
          (
            await current.pool.query(
              "SELECT usage_state,charged_microusd,actual_microusd FROM ai_budget_reservations",
            )
          ).rows[0],
        ).toMatchObject({
          usage_state: "unknown",
          charged_microusd: "1000",
          actual_microusd: null,
        });
        expect(
          (
            await current.pool.query(
              "SELECT state FROM ai_draft_work WHERE run_id=$1",
              [run],
            )
          ).rows[0].state,
        ).toBe("unknown");
        expect(
          (
            await current.pool.query(
              "SELECT status,provider_id FROM ticket_email_outbox WHERE order_id=$1",
              [order],
            )
          ).rows[0],
        ).toEqual({
          status: "uncertain",
          provider_id: "synthetic-provider-accepted",
        });
        expect(
          (
            await current.pool.query(
              "SELECT grant_effective_at,grant_expires_at FROM memberships WHERE owner_user_id='restore-member'",
            )
          ).rows[0],
        ).toEqual({ grant_effective_at: null, grant_expires_at: null });
        record({
          case: "baseline56-backup-current61-restore-old-module",
          baselineLedger: 56,
          currentLedger: expectedLedger,
          backupTool: "PostgreSQL16 pg_dump -Fc / pg_restore --exit-on-error",
          backupBytes: [baseline.backupBytes, current.backupBytes],
          backupSha256: [baseline.backupSha256, current.backupSha256],
          coreFingerprintUnchanged: true,
          journalHashesAndOrderingRetained: true,
          unknownBudgetChargeRetained: true,
          expiredUnknownClaimRetained: true,
          uncertainOutboxProviderReceiptRetained: true,
          historicalRightsRetained: true,
          historicalRepositorySha: historicalSha,
          historicalModuleSha256: createHash("sha256")
            .update(historical)
            .digest("hex"),
          historicalModuleReadWrite: true,
          currentRepositoryRead: true,
          flagOffOldWriterDenied: true,
          scope:
            "Actual isolated database restore and historical page-copy module; not a complete old app/worker binary or Production rollback",
          pass: true,
        });
      } finally {
        vi.unstubAllEnvs();
        await baseline?.close();
        await current?.close();
        if (!resolve(oldPath).startsWith(root + sep))
          throw Error("INVALID_HISTORICAL_SOURCE_PATH");
        rmSync(oldPath, { force: true });
        await f.close();
      }
    }, 180000);
  },
);
