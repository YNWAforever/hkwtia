import {randomUUID} from "node:crypto";

import {afterEach, describe, expect, it, vi} from "vitest";
import type {SQL} from "drizzle-orm";

import {importCommitBatchHandler, resetImportPlanSeatCache} from "@/lib/db/repos/batch-handlers/import-commit";
import {decideMembershipImport} from "@/lib/admin/imports/membership-decision";
import {batchPreviewDigest} from "@/lib/admin/batches/types";
import type {BatchClaim} from "@/lib/admin/batches/worker-types";

function sqlText(query: SQL): string {
  const chunks = (query as unknown as {queryChunks?: readonly unknown[]}).queryChunks ?? [];
  return chunks.map((chunk) => {
    if (typeof chunk === "string") return chunk;
    if (chunk && typeof chunk === "object" && "value" in chunk) {
      const value = (chunk as {value: unknown}).value;
      if (Array.isArray(value)) return value.join("");
      if (typeof value === "string") return value;
    }
    return " ";
  }).join("");
}

const decision = decideMembershipImport({email: "ada@example.test", displayName: "Ada", tier: "corporate", membershipStatus: "active", expiryAt: "2027-04-30"});
const values = {email: "ada@example.test", displayName: "Ada", tier: "corporate", membershipStatus: "active", expiryAt: "2027-04-30", membershipDecision: decision};
const rowId = "33333333-3333-4333-8333-333333333333";
const expectedVersion = batchPreviewDigest({rowNumber: 2, status: "create", values, targetId: null, profileVersion: null});

function claim(): BatchClaim {
  return {itemId: randomUUID(), batchId: randomUUID(), operation: "import_commit", actorProfileId: "staff", request: {operation: "import_commit", idempotencyKey: randomUUID(), payload: {importRunId: randomUUID()}}, target: {type: "import_row", id: rowId}, expectedVersion, effectKey: "effect", attemptCount: 1, leaseOwner: "worker", leaseToken: 1};
}

describe("import commit round trips", () => {
  afterEach(() => {resetImportPlanSeatCache(); vi.unstubAllEnvs();});

  it("reuses a plan seat and writes the row in one statement", async () => {
    vi.stubEnv("MEMBER_IMPORT_ENABLED", "true");
    vi.stubEnv("MEMBER_IMPORT_MEMBERSHIP_WRITE_ENABLED", "true");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
    const counts: number[] = [];
    const actor = {kind: "staff" as const, userId: "staff", profileId: "staff"};
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const seen: string[] = [];
      const tx = {execute: async (query: SQL) => {
        const text = sqlText(query);
        seen.push(text);
        if (text.includes("SAVEPOINT") || text.includes("RELEASE")) return {rows: []};
        if (text.includes("seatAllowance")) return {rows: [{seatAllowance: 12}]};
        if (text.includes("row_number")) return {rows: [{id: rowId, rowNumber: 2, status: "create", values, targetId: null, expectedVersion: null}]};
        if (text.includes("member.import.row.committed")) return {rows: [{outcome: "created", contactId: randomUUID(), membershipId: randomUUID(), membershipAction: "inserted"}]};
        throw new Error(`unexpected sql: ${text.slice(0, 500)}`);
      }};
      await expect(importCommitBatchHandler.execute(actor, claim(), tx)).resolves.toMatchObject({status: "succeeded"});
      counts.push(seen.length);
      if (attempt === 1) expect(seen.some((text) => text.includes("SAVEPOINT"))).toBe(false);
    }
    expect(counts[0]).toBeGreaterThan(counts[1] ?? 0);
    expect(counts[1]).toBe(2);
  });
});
