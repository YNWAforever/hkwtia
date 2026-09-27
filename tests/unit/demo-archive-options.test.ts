import {describe, expect, it} from "vitest";

import {parseDemoArchiveOptions} from "@/scripts/lib/demo-archive-options";

const ID = "11111111-1111-4111-8111-111111111111";

describe("demo event archive command", () => {
  it("defaults to a read-only dry run", () => {
    expect(parseDemoArchiveOptions({})).toEqual({mode: "dry-run", approvedIds: []});
  });

  it("requires exact UUID approvals for unpublish and restore", () => {
    expect(parseDemoArchiveOptions({mode: "unpublish", approvedIds: ID})).toEqual({mode: "unpublish", approvedIds: [ID]});
    expect(parseDemoArchiveOptions({mode: "restore", approvedIds: ID})).toEqual({mode: "restore", approvedIds: [ID]});
    expect(() => parseDemoArchiveOptions({mode: "unpublish"})).toThrow("DEMO_APPROVED_IDS_REQUIRED");
    expect(() => parseDemoArchiveOptions({mode: "unpublish", approvedIds: "*"})).toThrow();
    expect(() => parseDemoArchiveOptions({mode: "restore", approvedIds: "wtia-global-growth-demo-briefing-2026"})).toThrow();
  });

  it("rejects unsupported modes instead of silently applying a fallback", () => {
    expect(() => parseDemoArchiveOptions({mode: "delete", approvedIds: ID})).toThrow("DEMO_ARCHIVE_MODE_INVALID");
  });
});
