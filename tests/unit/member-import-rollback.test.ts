import {readFileSync} from "node:fs";

import {describe, expect, it} from "vitest";

import {applyMemberImportRollback, assertMemberImportRollbackAuthorized, MEMBER_IMPORT_ROLLBACK_PRESERVED, MEMBER_IMPORT_ROLLBACK_STEPS, memberImportRollbackAuditSql} from "@/scripts/lib/member-import-rollback";

const runId = "11111111-1111-4111-8111-111111111111";
const batchId = "22222222-2222-4222-8222-222222222222";
const enabled = {MEMBER_IMPORT_ENABLED: "true", MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED: "true", MEMBER_IMPORT_ROLLBACK_RUN_ID: runId, MEMBER_IMPORT_ROLLBACK_BATCH_ID: batchId, NODE_ENV: "test"};

describe("member import rollback guard", () => {
  it("refuses production and stays a dry-run until apply is explicit", () => {
    expect(assertMemberImportRollbackAuthorized(enabled).apply).toBe(false);
    expect(() => assertMemberImportRollbackAuthorized({...enabled, VERCEL_ENV: "production", MEMBER_IMPORT_ROLLBACK_APPLY: "true"})).toThrow("MEMBER_IMPORT_ROLLBACK_PRODUCTION_FORBIDDEN");
    expect(() => assertMemberImportRollbackAuthorized({...enabled, NODE_ENV: "production", MEMBER_IMPORT_ROLLBACK_APPLY: "true"})).toThrow("MEMBER_IMPORT_ROLLBACK_PRODUCTION_FORBIDDEN");
    expect(() => assertMemberImportRollbackAuthorized({...enabled, VERCEL_ENV: "preview", NODE_ENV: "production"})).not.toThrow();
    expect(() => assertMemberImportRollbackAuthorized({...enabled, MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED: "false"})).toThrow("MEMBER_IMPORT_ROLLBACK_NOT_AUTHORIZED");
    expect(() => assertMemberImportRollbackAuthorized({...enabled, MEMBER_IMPORT_ROLLBACK_RUN_ID: batchId, MEMBER_IMPORT_ROLLBACK_BATCH_ID: batchId})).toThrow("MEMBER_IMPORT_ROLLBACK_SCOPE_REQUIRED");
    expect(assertMemberImportRollbackAuthorized({...enabled, MEMBER_IMPORT_ROLLBACK_APPLY: "true"}).apply).toBe(true);
  });

  it("scopes deletes to the run and batch and does not remove catalog plans", () => {
    const source = readFileSync("scripts/lib/member-import-rollback.ts", "utf8");
    expect(source).not.toMatch(/DELETE FROM membership_plans/i);
    expect(memberImportRollbackAuditSql).toContain("$1");
    expect(memberImportRollbackAuditSql).toContain("$2");
    expect(memberImportRollbackAuditSql).toContain("member.import.row.committed");
    expect(MEMBER_IMPORT_ROLLBACK_PRESERVED).toContain("membership_plans");
    expect(MEMBER_IMPORT_ROLLBACK_STEPS).toEqual([
      "verify-scope",
      "refuse-profile-updates",
      "refuse-dependents",
      "delete-inserted-memberships",
      "delete-import-contacts",
      "delete-hidden-profile-shells",
      "delete-import-audits",
      "record-rollback-audit",
      "restore-run-confirmed",
    ]);
  });

  it("does not open a transaction for a dry-run call", async () => {
    const db = {query: () => {throw new Error("QUERY");}};
    await expect(applyMemberImportRollback(db, {runId, batchId, apply: false})).rejects.toThrow("MEMBER_IMPORT_ROLLBACK_DRY_RUN");
  });
});
