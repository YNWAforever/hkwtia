// @vitest-environment node
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { randomUUID } from "node:crypto";
import { isolatedBatchDatabase } from "./admin-batch-fixture";
import { createMemberImportRepository } from "@/lib/db/repos/member-imports";
import {
  createAdminBatchesRepository,
  createAdminBatchWorkerRepository,
} from "@/lib/db/repos/admin-batches";
import { importCommitBatchHandler } from "@/lib/db/repos/batch-handlers/import-commit";
import {
  batchPreviewDigest,
  batchRequestSchema,
} from "@/lib/admin/batches/types";
import { downloadMemberBatchCsv } from "@/lib/db/repos/admin-batch-export";
import { exportMembersBatchHandler } from "@/lib/db/repos/batch-handlers/export-members";
import { parseMemberImport } from "@/lib/admin/imports/parse";
const staff = { kind: "staff", profileId: "staff", userId: "staff" } as const;
let fixture: Awaited<ReturnType<typeof isolatedBatchDatabase>>;
const now = new Date();
const bytes = (s: string) => new TextEncoder().encode(s);
describe.skipIf(process.env.RUN_POSTGRES_INTEGRATION !== "1")(
  "full safe import/export actual SQL",
  () => {
    beforeAll(async () => {
      fixture = await isolatedBatchDatabase();
    }, 60000);
    afterAll(async () => {
      if (fixture) await fixture.close();
    });
    beforeEach(() => {
      vi.stubEnv("ADMIN_BATCH_ENABLED", "true");
      vi.stubEnv("MEMBER_IMPORT_ENABLED", "true");
      vi.stubEnv("MEMBER_EXPORT_ENABLED", "true");
    });
    afterEach(() => vi.unstubAllEnvs());
    it("refuses expired private import details even before the retention worker scrubs them", async () => {
      const imports = createMemberImportRepository(
        async () => fixture.database,
        () => now,
      );
      const upload = await imports.upload(
        staff,
        bytes("Email,Name\nexpired-synthetic@example.test,Synthetic contact\n"),
        "csv",
      );
      const run = await imports.validate(staff, upload.uploadId, {
        email: "Email",
        displayName: "Name",
      });
      await fixture.pool.query(
        "UPDATE member_import_runs SET expires_at=$2 WHERE id=$1",
        [run.runId, new Date(now.getTime() - 1)],
      );
      await expect(imports.read(staff, run.runId)).rejects.toThrow(
        "IMPORT_RUN_EXPIRED",
      );
    });
    it("pins the imported row decision and values to the batch preview, independently of a profile version", async () => {
      const imports = createMemberImportRepository(
        async () => fixture.database,
        () => now,
      );
      const upload = await imports.upload(
        staff,
        bytes(
          "Email,Name,Locale\npinned-synthetic@example.test,Original synthetic contact,en\n",
        ),
        "csv",
      );
      const run = await imports.validate(staff, upload.uploadId, {
        email: "Email",
        displayName: "Name",
        locale: "Locale",
      });
      await imports.confirm(staff, run.runId, [2]);
      const request = batchRequestSchema.parse({
        operation: "import_commit",
        idempotencyKey: randomUUID(),
        payload: { importRunId: run.runId },
      });
      const store = createAdminBatchesRepository(
          async () => fixture.database,
          () => now,
        ),
        worker = createAdminBatchWorkerRepository(async () => fixture.database);
      const { batchId } = await store.create(
        staff,
        request,
        batchPreviewDigest(request),
      );
      await worker.prepareNext(
        { import_commit: importCommitBatchHandler },
        now,
      );
      const preview = await store.preview(staff, batchId);
      await store.commit(staff, batchId, preview.digest);
      await fixture.pool.query(
        `UPDATE member_import_rows SET validated_payload=jsonb_set(validated_payload,'{displayName}','"Changed after preview"') WHERE run_id=$1`,
        [run.runId],
      );
      const [claim] = await worker.claimItems(
        "synthetic-import-worker",
        now,
        1,
      );
      await worker.executeClaim(claim!, importCommitBatchHandler, now);
      expect((await store.preview(staff, batchId)).items[0]).toMatchObject({
        state: "skipped",
        reasonCode: "IMPORT_ROW_CHANGED",
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT count(*) FROM contacts WHERE email='pinned-synthetic@example.test'",
          )
        ).rows[0].count,
      ).toBe("0");
    });
    it("rejects a NUL-containing upload with a safe validation error before PostgreSQL rejects its JSON", async () => {
      const imports = createMemberImportRepository(
        async () => fixture.database,
        () => now,
      );
      await expect(
        imports.upload(
          staff,
          bytes("Email,Name\nnul-synthetic@example.test,Nu\u0000l\n"),
          "csv",
        ),
      ).rejects.toThrow("IMPORT_CONTROL_CHARACTER_FORBIDDEN");
    });
    it("downloads only source row numbers and issue codes for the owning admin, within the staging TTL", async () => {
      const imports = createMemberImportRepository(
        async () => fixture.database,
        () => now,
      );
      const upload = await imports.upload(
        staff,
        bytes(
          '\uFEFFEmail,Name,Locale\r\nreport-new@example.test,"陳, Synthetic\nName",en\r\nREPORT-NEW@EXAMPLE.TEST,Duplicate,en\r\na@example.test,Existing,en\r\ninvalid,Invalid,en\r\n',
        ),
        "csv",
      );
      const run = await imports.validate(staff, upload.uploadId, {
        email: "Email",
        displayName: "Name",
        locale: "Locale",
      });
      expect(run).toMatchObject({
        create: 1,
        duplicate: 1,
        conflict: 1,
        invalid: 1,
        total: 4,
      });
      const issues = await imports.issues(staff, run.runId);
      expect(issues).toEqual([
        { rowNumber: 3, status: "duplicate", reason: "DUPLICATE_EMAIL" },
        { rowNumber: 4, status: "conflict", reason: "EMAIL_CANDIDATE_REVIEW" },
        { rowNumber: 5, status: "invalid", reason: "EMAIL_INVALID" },
      ]);
      expect(JSON.stringify(issues)).not.toMatch(
        /@|displayName|values|before|auth_user/,
      );
      await expect(
        imports.issues(
          { kind: "member", profileId: "a", userId: "a" } as never,
          run.runId,
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        imports.issues(
          { ...staff, profileId: "other", userId: "other" },
          run.runId,
        ),
      ).rejects.toThrow("IMPORT_RUN_UNAVAILABLE");
      vi.stubEnv("MEMBER_IMPORT_ENABLED", "false");
      await expect(imports.issues(staff, run.runId)).rejects.toThrow(
        "IMPORT_DISABLED",
      );
      vi.stubEnv("MEMBER_IMPORT_ENABLED", "true");
      await fixture.pool.query(
        "UPDATE member_import_runs SET expires_at=$2 WHERE id=$1",
        [run.runId, new Date(now.getTime() - 1)],
      );
      await expect(imports.issues(staff, run.runId)).rejects.toThrow(
        "IMPORT_RUN_EXPIRED",
      );
      expect(
        (
          await fixture.pool.query(
            "SELECT metadata FROM audit_events WHERE action='member.import.issues_downloaded' AND target_id=$1",
            [run.runId],
          )
        ).rows,
      ).toEqual([{ metadata: { rows: 3 } }]);
    });
    it("protects a changed update payload while retaining the original profile identity and membership", async () => {
      const imports = createMemberImportRepository(
          async () => fixture.database,
          () => now,
        ),
        csv = bytes("Member ID,Email,Locale\na,a@example.test,zh-HK\n");
      const upload = await imports.upload(staff, csv, "csv"),
        run = await imports.validate(staff, upload.uploadId, {
          profileId: "Member ID",
          email: "Email",
          locale: "Locale",
        });
      await imports.confirm(staff, run.runId, [2]);
      const request = batchRequestSchema.parse({
          operation: "import_commit",
          idempotencyKey: randomUUID(),
          payload: { importRunId: run.runId },
        }),
        store = createAdminBatchesRepository(
          async () => fixture.database,
          () => now,
        ),
        worker = createAdminBatchWorkerRepository(async () => fixture.database);
      const { batchId } = await store.create(
        staff,
        request,
        batchPreviewDigest(request),
      );
      await worker.prepareNext(
        { import_commit: importCommitBatchHandler },
        now,
      );
      const preview = await store.preview(staff, batchId);
      await store.commit(staff, batchId, preview.digest);
      const before = (
        await fixture.pool.query(
          "SELECT p.email,p.role,p.locale,m.status,m.plan_code FROM profiles p JOIN memberships m ON m.owner_user_id=p.id WHERE p.id='a'",
        )
      ).rows;
      await fixture.pool.query(
        `UPDATE member_import_rows SET validated_payload=jsonb_set(validated_payload,'{tags}','["changed-after-preview"]') WHERE run_id=$1`,
        [run.runId],
      );
      const [claim] = await worker.claimItems(
        "synthetic-import-worker",
        now,
        1,
      );
      await worker.executeClaim(claim!, importCommitBatchHandler, now);
      expect((await store.preview(staff, batchId)).items[0]).toMatchObject({
        state: "skipped",
        reasonCode: "IMPORT_ROW_CHANGED",
      });
      expect(
        (
          await fixture.pool.query(
            "SELECT p.email,p.role,p.locale,m.status,m.plan_code FROM profiles p JOIN memberships m ON m.owner_user_id=p.id WHERE p.id='a'",
          )
        ).rows,
      ).toEqual(before);
    });
    it("exports literal formulas, control prefixes, Chinese, commas and newlines safely, then rejects foreign roles and expired downloads", async () => {
      const values = [
        "=1+1",
        "+SUM(1,2)",
        "-1+1",
        "@SUM(1,2)",
        "\t=1+1",
        "\r@SUM(1,2)",
        "陳, Synthetic\nName",
      ];
      const ids = values.map((_, i) => `t15-export-synthetic-${i}`);
      for (const [i, id] of ids.entries())
        await fixture.pool.query(
          "INSERT INTO profiles(id,display_name,email,locale,role) VALUES($1,$2,$3,'en','member')",
          [id, values[i], id + "@example.test"],
        );
      const store = createAdminBatchesRepository(
          async () => fixture.database,
          () => now,
        ),
        worker = createAdminBatchWorkerRepository(async () => fixture.database),
        request = batchRequestSchema.parse({
          operation: "export_members",
          idempotencyKey: randomUUID(),
          selection: { mode: "ids", profileIds: ids },
          payload: { fields: ["displayName"] },
        });
      const { batchId } = await store.create(
        staff,
        request,
        batchPreviewDigest(request),
      );
      await worker.prepareNext(
        { export_members: exportMembersBatchHandler },
        now,
      );
      const preview = await store.preview(staff, batchId);
      await store.commit(staff, batchId, preview.digest);
      for (const claim of await worker.claimItems(
        "synthetic-export-worker",
        now,
        50,
      ))
        await worker.executeClaim(claim, exportMembersBatchHandler, now);
      const report = await downloadMemberBatchCsv(
        staff,
        batchId,
        async () => fixture.database,
        now,
      );
      expect(report.rowCount).toBe(values.length);
      expect(report.csv.charCodeAt(0)).toBe(0xfeff);
      const parsed = await parseMemberImport(bytes(report.csv), "csv");
      expect(parsed.rows.map((r) => r.cells.displayName)).toEqual(
        values.map((v, i) => (i < 6 ? "'" + v : v)),
      );
      expect(report.csv).not.toContain("@example.test");
      await expect(
        downloadMemberBatchCsv(
          { kind: "member", profileId: ids[0]!, userId: ids[0]! },
          batchId,
          async () => fixture.database,
          now,
        ),
      ).rejects.toThrow("FORBIDDEN");
      await expect(
        downloadMemberBatchCsv(
          { ...staff, profileId: "other" },
          batchId,
          async () => fixture.database,
          now,
        ),
      ).rejects.toThrow("BATCH_NOT_FOUND");
      await expect(
        downloadMemberBatchCsv(
          staff,
          batchId,
          async () => fixture.database,
          new Date(now.getTime() + 1800000),
        ),
      ).rejects.toThrow("EXPORT_EXPIRED");
    });
  },
);
