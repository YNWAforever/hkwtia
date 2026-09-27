import {describe, expect, it} from "vitest";

import {batchRequestSchema, batchPreviewDigest, batchRetryDelayMs, batchRuntimeConfig} from "@/lib/admin/batches/types";

const selection = {mode: "ids", profileIds: ["member-a"]} as const;
const key = "11111111-1111-4111-8111-111111111111";

describe("admin batch request contract", () => {
  it("accepts a narrow profile patch and rejects actor, role, payment and consent fields", () => {
    expect(batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: key, selection, payload: {patch: {locale: "zh-HK"}, reason: "Staff correction"}})).toMatchObject({operation: "profile_patch"});
    for (const patch of [{role: "superadmin"}, {stripeSubscriptionId: "sub_x"}, {consentMarketing: true}, {status: "active"}, {}]) {
      expect(() => batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: key, selection, payload: {patch, reason: "Staff correction"}})).toThrow();
    }
    expect(() => batchRequestSchema.parse({operation: "profile_patch", idempotencyKey: key, selection, payload: {patch: {locale: "en"}, reason: "Staff correction"}, actor: "superadmin"})).toThrow();
  });

  it("keeps import, grant, communication, ticket and export payloads in distinct strict variants", () => {
    const variants = [
      {operation: "import_commit", payload: {importRunId: key}},
      {operation: "membership_grant", targets: [{kind: "profile", profileId: "member-a"}], payload: {planCode: "startup", effectiveAt: "2026-10-01T00:00:00.000Z", expiresAt: "2027-10-01T00:00:00.000Z", reason: "Approved programme"}},
      {operation: "renewal_reminder", selection, payload: {channel: "email"}},
      {operation: "profile_update_invite", selection, payload: {channel: "email"}},
      {operation: "ticket_resend", targetSeatIds: [key], payload: {}},
      {operation: "export_members", selection, payload: {fields: ["displayName", "email"]}},
    ];
    for (const variant of variants) expect(batchRequestSchema.parse({...variant, idempotencyKey: key}).operation).toBe(variant.operation);
    expect(() => batchRequestSchema.parse({...variants[0], idempotencyKey: key, selection})).toThrow();
    expect(() => batchRequestSchema.parse({...variants[4], idempotencyKey: key, payload: {forcePaid: true}})).toThrow();
    expect(() => batchRequestSchema.parse({...variants[1], idempotencyKey: key, payload: {planCode: "startup", effectiveAt: "2026-09-30T23:00:00-02:00", expiresAt: "2026-10-01T00:00:00Z", reason: "Approved programme"}})).toThrow();
  });

  it("uses a canonical digest and bounded operational defaults", () => {
    expect(batchPreviewDigest({operation: "profile_patch", targets: ["a", "b"], payload: {locale: "en"}})).toBe(batchPreviewDigest({payload: {locale: "en"}, targets: ["a", "b"], operation: "profile_patch"}));
    expect(batchPreviewDigest({operation: "profile_patch", targets: ["a", "b"]})).not.toBe(batchPreviewDigest({operation: "profile_patch", targets: ["b", "a"]}));
    expect(batchRetryDelayMs(1)).toBe(60_000);
    expect(batchRetryDelayMs(2)).toBe(300_000);
    expect(batchRetryDelayMs(3)).toBe(900_000);
    expect(batchRetryDelayMs(4)).toBe(3_600_000);
    expect(batchRuntimeConfig()).toMatchObject({maxItems: 5000, claimSize: 50, maxAttempts: 5, previewTtlMs: 1_800_000});
  });
});
