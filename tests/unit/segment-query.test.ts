import {describe, expect, it} from "vitest";

import {previewSegment, type SegmentReader} from "@/lib/admin/segments";
import type {AdminActor} from "@/lib/membership/lifecycle";

const actor: AdminActor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};

describe("segment preview", () => {
  it("passes the exact corporate, below-20-score, renewal-within-60-days fixture to the shared reader", async () => {
    const calls: unknown[] = [];
    const reader: SegmentReader = {
      preview: async (_actor, filter, pagination) => {
        calls.push({filter, pagination});
        return {total: 1, items: [{profileId: "corporate-low-score", displayName: "Corporate Low Score", email: "member@example.test", companyName: "Acme", planCode: "corporate", membershipStatus: "active", renewalAt: "2026-09-01T00:00:00.000Z", score: 19}], nextCursor: null};
      },
    };

    const preview = await previewSegment(actor, {filter: {tier: ["corporate"], scoreMax: 19.99, renewalWithinDays: 60}, limit: "25", cursor: null}, reader);

    expect(preview.items.map((item) => item.profileId)).toEqual(["corporate-low-score"]);
    expect(calls).toEqual([{
      filter: {tier: ["corporate"], status: [], scoreMin: null, scoreMax: 19.99, renewalWithinDays: 60, sector: "", lastLoginBeforeDays: null},
      pagination: {limit: 25, cursor: null},
    }]);
  });

  it("rejects an invalid filter before the reader can run", async () => {
    const reader: SegmentReader = {preview: async () => { throw new Error("PRIVATE_READ"); }};

    await expect(previewSegment(actor, {filter: {unknown: "value"}}, reader)).rejects.toThrow();
  });
});
