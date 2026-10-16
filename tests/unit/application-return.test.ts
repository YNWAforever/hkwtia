import { describe, expect, it } from "vitest";
import { applicationQueueReturnHref } from "@/lib/admin/application-return";
describe("case back navigation preserves only validated queue scope", () => {
  it("retains status, search, bounded page size and cursor across bilingual case navigation", () => {
    const result = new URL(
      applicationQueueReturnHref(
        "zh-HK",
        "/admin/members/queue?status=pending_payment&q=Synthetic&limit=10&cursor=opaque",
      ),
      "https://example.test",
    );
    expect(result.pathname).toBe("/zh/admin/members/queue");
    expect(Object.fromEntries(result.searchParams)).toEqual({
      status: "pending_payment",
      q: "Synthetic",
      limit: "10",
      cursor: "opaque",
    });
  });
  it.each([
    "https://evil.test/admin/members/queue?status=pending_review",
    "//evil.test/admin/members/queue",
    "/admin/members/queue?status=active",
    "/admin/members/queue?limit=5000",
    "/admin/members/queue?status=draft&status=pending_review",
    "/admin/members/queue?actor=superadmin",
    "/admin/users",
  ])("rejects arbitrary or invalid return target %s", (raw) => {
    expect(applicationQueueReturnHref("en", raw)).toBe("/admin/members/queue");
  });
});
