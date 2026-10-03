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
const dir = "docs/audits/hkwtia-2026-10-01-remediation/evidence/t22";
const receipt: Record<string, unknown> = {
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
      const f = await isolatedAuditDatabase();
      try {
        const ledger = () =>
          f.pool.query(
            "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
          );
        expect((await ledger()).rows[0].n).toBe(56);
        await f.migrateRemaining();
        await f.migrateRemaining();
        expect((await ledger()).rows[0].n).toBe(56);
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
          ledger: 56,
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
          if (entry.idx === 56)
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
        ).toBe(56);
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
          repeatedUpgradeLedger: 56,
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
  },
);
