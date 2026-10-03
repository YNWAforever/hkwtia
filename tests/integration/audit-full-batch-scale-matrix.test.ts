// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isolatedAuditDatabase } from "./audit-database-fixture";
const state = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/lib/db/repos/common", async (original) => ({
  ...(await original<typeof import("@/lib/db/repos/common")>()),
  getDb: async () => state.database,
}));
import { batchOperationHandlers } from "@/lib/admin/batches/handlers/registry";
import {
  batchPreviewDigest,
  batchRequestSchema,
  type BatchOperation,
} from "@/lib/admin/batches/types";
import {
  createAdminBatchesRepository,
  createAdminBatchWorkerRepository,
  type BatchDatabase,
} from "@/lib/db/repos/admin-batches";
import { createMemberImportRepository } from "@/lib/db/repos/member-imports";
import { downloadMemberBatchCsv } from "@/lib/admin/batches/export";
import { downloadEventAttendeeArtifact } from "@/lib/db/repos/batch-handlers/export-event-attendees";
const operations = [
  "profile_patch",
  "membership_grant",
  "renewal_reminder",
  "profile_update_invite",
  "import_commit",
  "export_members",
  "export_event_attendees",
  "ticket_resend",
] as const satisfies readonly BatchOperation[];
const enabled =
  process.env.RUN_POSTGRES_INTEGRATION === "1" &&
  process.env.RUN_AUDIT_FULL_MATRIX === "1";
const root = {
  kind: "superadmin",
  profileId: "matrix-root",
  userId: "matrix-root-auth",
} as const;
let f: Awaited<ReturnType<typeof isolatedAuditDatabase>>;
// New runs must never overwrite a committed historical acceptance receipt.
const dir = ".playwright/full-fix-batch-matrix-" + randomUUID();
console.log("BATCH_MATRIX_RECEIPT_DIRECTORY", dir);
const receipt: Record<string, unknown> = {
  environment:
    "owned disposable PostgreSQL16; complete ledger56; actual repositories and all eight real handlers",
  production: false,
  providerCalls: 0,
  syntheticOnly: true,
  cases: [],
};
function record(value: Record<string, unknown>) {
  (receipt.cases as Record<string, unknown>[]).push(value);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    dir + "/batch-scale-matrix.json",
    JSON.stringify(receipt, null, 2) + "\n",
  );
}
describe.skipIf(!enabled)(
  "eight operations across50/500/5000 on actual full-schema SQL",
  () => {
    beforeAll(async () => {
      f = await isolatedAuditDatabase();
      state.database = f.database;
      receipt.sourceSha = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim();
      for (const flag of [
        "ADMIN_BATCH_ENABLED",
        "MEMBERSHIP_GRANTS_ENABLED",
        "MEMBERSHIP_GRANT_BATCH_ENABLED",
        "MEMBER_COMMUNICATION_BATCH_ENABLED",
        "MEMBER_IMPORT_ENABLED",
        "MEMBER_EXPORT_ENABLED",
        "EVENT_ATTENDEE_EXPORT_ENABLED",
        "TICKET_RESEND_BATCH_ENABLED",
      ])
        vi.stubEnv(flag, "true");
      vi.stubEnv("APP_URL", "http://localhost:3450");
      vi.stubEnv("RUN_LIVE_WOZTELL", "0");
      vi.stubEnv("EMAIL_DELIVERY_MODE", "test");
      await f.pool.query(
        "INSERT INTO profiles(id,auth_user_id,display_name,role) VALUES('matrix-root','matrix-root-auth','Synthetic matrix administrator','superadmin')",
      );
    }, 120000);
    afterAll(async () => {
      vi.unstubAllEnvs();
      if (f) await f.close();
    });
    for (const operation of operations)
      for (const size of [50, 500, 5000])
        it(`${operation} ${size}: preview/CAS/claims/settlement and durable effect count`, async () => {
          const prefix = "matrix-" + randomUUID(),
            ids = Array.from(
              { length: size },
              (_, i) => prefix + ":" + (i + 1),
            ),
            event = randomUUID(),
            segment = randomUUID(),
            start = performance.now();
          const result: Record<string, unknown> = {
            operation,
            size,
            passed: false,
            providerBoundary:
              operation === "renewal_reminder" ||
              operation === "profile_update_invite"
                ? "review-required draft recipients only; no queue/send"
                : operation === "ticket_resend"
                  ? "durable pass outbox only; no mail provider"
                  : "no providers",
          };
          try {
            await f.pool.query(
              "INSERT INTO profiles(id,auth_user_id,display_name,email,locale,consent_marketing) SELECT $1||':'||i,$1||':auth:'||i,$1||' Synthetic '||i,$1||'-'||i||'@example.test','en',true FROM generate_series(1,$2::int) i",
              [prefix, size],
            );
            const common = { idempotencyKey: randomUUID() },
              selection = {
                mode: "query",
                query: { search: prefix },
                excludedProfileIds: [],
              };
            let input: unknown;
            if (operation === "profile_patch")
              input = {
                ...common,
                operation,
                selection,
                payload: {
                  patch: { locale: "zh-HK" },
                  reason: "Synthetic member requested language correction",
                },
              };
            if (operation === "membership_grant")
              input = {
                ...common,
                operation,
                targets: ids.map((profileId) => ({
                  kind: "profile",
                  profileId,
                })),
                payload: {
                  planCode: "community",
                  effectiveAt: "2040-01-01T00:00:00.000Z",
                  expiresAt: "2040-02-01T00:00:00.000Z",
                  reason: "Synthetic isolated finite grant acceptance",
                },
              };
            if (operation === "export_members")
              input = {
                ...common,
                operation,
                selection,
                payload: { fields: ["displayName", "email", "locale"] },
              };
            if (operation === "import_commit") {
              const imports = createMemberImportRepository(
                  async () => f.database,
                ),
                bytes = new TextEncoder().encode(
                  "Member ID,Email,Locale\n" +
                    ids
                      .map(
                        (id, i) =>
                          `${id},${prefix}-${i + 1}@example.test,zh-HK`,
                      )
                      .join("\n"),
                );
              const upload = await imports.upload(root, bytes, "csv"),
                staged = await imports.validate(root, upload.uploadId, {
                  profileId: "Member ID",
                  email: "Email",
                  locale: "Locale",
                });
              expect(staged).toMatchObject({
                total: size,
                update: size,
                conflict: 0,
                invalid: 0,
              });
              await imports.confirm(
                root,
                staged.runId,
                ids.map((_, i) => i + 2),
              );
              input = {
                ...common,
                operation,
                payload: { importRunId: staged.runId },
              };
            }
            if (
              operation === "renewal_reminder" ||
              operation === "profile_update_invite"
            ) {
              await f.pool.query(
                "INSERT INTO memberships(owner_user_id,plan_code,status,seat_limit,billing_period_end) SELECT id,'community','active',1,'2040-01-01' FROM profiles WHERE id LIKE $1",
                [prefix + ":%"],
              );
              await f.pool.query(
                "INSERT INTO saved_segments(id,owner_profile_id,name_en,filter_version,filters) VALUES($1,'matrix-root','Synthetic isolated scope',2,'{}')",
                [segment],
              );
              const payload = { channel: "email", segmentId: segment };
              input =
                operation === "profile_update_invite"
                  ? { ...common, operation, selection, payload }
                  : {
                      ...common,
                      operation,
                      membershipIds: (
                        await f.pool.query(
                          "SELECT id FROM memberships WHERE owner_user_id LIKE $1 ORDER BY owner_user_id",
                          [prefix + ":%"],
                        )
                      ).rows.map((row) => row.id),
                      payload,
                    };
            }
            if (
              operation === "export_event_attendees" ||
              operation === "ticket_resend"
            ) {
              await f.pool.query(
                "INSERT INTO events(id,slug,title_en,description_en,starts_at,published,status,visibility,registration_mode,ticket_price_hkd_cents,capacity) VALUES($1,$2,'Synthetic matrix event','Synthetic matrix acceptance','2040-01-01',true,'published','public','ticketed',1000,10000)",
                [event, prefix],
              );
              if (operation === "export_event_attendees") {
                await f.pool.query(
                  "INSERT INTO event_guest_registrations(event_id,name,email,status,cancel_token_digest,idempotency_key) SELECT $1,$2||' Synthetic Guest '||i,$2||'-'||i||'@example.test','registered',md5(i::text)||md5(i::text),$2||'-guest-'||i FROM generate_series(1,$3::int) i",
                  [event, prefix, size],
                );
                input = {
                  ...common,
                  operation,
                  payload: { eventId: event, search: prefix },
                };
              } else {
                // Synthetic stored paid records test the resend contract, not Stripe payment acceptance.
                await f.pool.query(
                  "INSERT INTO event_orders(event_id,buyer_profile_id,buyer_name,buyer_email,buyer_locale,amount_hkd_cents,status,idempotency_key,expires_at,paid_at) SELECT $1,id,display_name,email,'en',1000,'paid',$2||':order:'||id,'2040-01-01',now() FROM profiles WHERE id LIKE $3",
                  [event, prefix, prefix + ":%"],
                );
                await f.pool.query(
                  "INSERT INTO event_order_seats(order_id,position,attendee_name,attendee_email) SELECT id,1,buyer_name,buyer_email FROM event_orders WHERE event_id=$1",
                  [event],
                );
                input = {
                  ...common,
                  operation,
                  targetSeatIds: (
                    await f.pool.query(
                      "SELECT s.id FROM event_order_seats s JOIN event_orders o ON o.id=s.order_id WHERE o.event_id=$1 ORDER BY s.id",
                      [event],
                    )
                  ).rows.map((row) => row.id),
                  payload: {},
                };
              }
            }
            const request = batchRequestSchema.parse(input),
              db = f.database as unknown as BatchDatabase,
              batches = createAdminBatchesRepository(async () => db),
              worker = createAdminBatchWorkerRepository(async () => db),
              { batchId } = await batches.create(
                root,
                request,
                batchPreviewDigest(request),
              );
            expect(
              await worker.prepareNext(batchOperationHandlers, new Date()),
            ).toBe(true);
            const preview = await batches.preview(root, batchId),
              total = operation === "export_event_attendees" ? 1 : size;
            expect(preview).toMatchObject({
              state: "ready",
              total,
              eligible: total,
              blocked: 0,
            });
            if (operation === "export_event_attendees")
              expect(preview.items[0]?.after.rowCount).toBe(size);
            await expect(
              batches.commit(root, batchId, "0".repeat(64)),
            ).rejects.toThrow();
            await batches.commit(root, batchId, preview.digest);
            await expect(
              batches.commit(root, batchId, preview.digest),
            ).rejects.toThrow("BATCH_NOT_READY");
            let settled = 0,
              first:
                | Awaited<ReturnType<typeof worker.claimItems>>[number]
                | undefined,
              largestClaim = 0;
            while (settled < total) {
              const claims = await worker.claimItems(
                "synthetic-matrix",
                new Date(),
                50,
              );
              expect(claims.length).toBeGreaterThan(0);
              expect(claims.length).toBeLessThanOrEqual(50);
              largestClaim = Math.max(largestClaim, claims.length);
              first ??= claims[0];
              for (const claim of claims)
                expect(
                  await worker.executeClaim(
                    claim,
                    batchOperationHandlers[operation],
                    new Date(),
                  ),
                ).toBe("settled");
              settled += claims.length;
              if (settled % 1000 === 0)
                console.log("MATRIX_PROGRESS", operation, size, settled);
            }
            expect((await batches.preview(root, batchId)).counters).toEqual({
              pending: 0,
              running: 0,
              succeeded: total,
              skipped: 0,
              failed: 0,
            });
            const auditBefore = (
              await f.pool.query("SELECT count(*)::int AS n FROM audit_events")
            ).rows[0].n;
            await worker.executeClaim(
              first!,
              batchOperationHandlers[operation],
              new Date(),
            );
            expect(
              (
                await f.pool.query(
                  "SELECT count(*)::int AS n FROM audit_events",
                )
              ).rows[0].n,
            ).toBe(auditBefore);
            if (operation === "profile_patch" || operation === "import_commit")
              expect(
                (
                  await f.pool.query(
                    "SELECT count(*)::int AS n FROM profiles WHERE id LIKE $1 AND locale='zh-HK'",
                    [prefix + ":%"],
                  )
                ).rows[0].n,
              ).toBe(size);
            if (operation === "membership_grant")
              expect(
                (
                  await f.pool.query(
                    "SELECT count(*)::int AS n FROM memberships WHERE owner_user_id LIKE $1 AND grant_effective_at IS NOT NULL AND grant_expires_at IS NOT NULL",
                    [prefix + ":%"],
                  )
                ).rows[0].n,
              ).toBe(size);
            if (
              operation === "renewal_reminder" ||
              operation === "profile_update_invite"
            ) {
              expect(
                (
                  await f.pool.query(
                    "SELECT count(*)::int AS n FROM campaign_recipients r JOIN campaigns c ON c.id=r.campaign_id WHERE c.variables_template->>'_batchId'=$1 AND c.status='draft'",
                    [batchId],
                  )
                ).rows[0].n,
              ).toBe(size);
              expect(
                (await f.pool.query("SELECT count(*)::int AS n FROM email_log"))
                  .rows[0].n,
              ).toBe(0);
              expect(
                (
                  await f.pool.query(
                    "SELECT count(*)::int AS n FROM whatsapp_log",
                  )
                ).rows[0].n,
              ).toBe(0);
            }
            if (operation === "ticket_resend")
              expect(
                (
                  await f.pool.query(
                    "SELECT count(*)::int AS n FROM ticket_email_outbox t JOIN event_orders o ON o.id=t.order_id WHERE o.event_id=$1 AND t.status='queued'",
                    [event],
                  )
                ).rows[0].n,
              ).toBe(size);
            if (operation === "export_members")
              expect(
                (
                  await downloadMemberBatchCsv(
                    root,
                    batchId,
                    async () => db,
                    new Date(),
                  )
                ).rowCount,
              ).toBe(size);
            if (operation === "export_event_attendees")
              expect(
                (
                  await downloadEventAttendeeArtifact(
                    root,
                    batchId,
                    async () => db,
                    new Date(),
                  )
                ).rowCount,
              ).toBe(size);
            Object.assign(result, {
              passed: true,
              elapsedMs: performance.now() - start,
              totalBatchItems: total,
              settled,
              largestClaim,
              duplicateCommitRejectedNoSecondEffect: true,
              settledClaimReplayNoNewAudit: true,
            });
          } finally {
            record(result);
          }
        }, 900000);
  },
);
