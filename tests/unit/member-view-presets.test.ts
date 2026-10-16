import {describe, expect, it} from "vitest";

import {memberPresetQueries} from "@/lib/admin/member-view-presets";

describe("member operations default views", () => {
  it("uses Hong Kong civil days for 30/60/90-day renewal views without including past due", () => {
    const views = memberPresetQueries(new Date("2026-09-27T12:00:00.000Z"));
    expect(views.due30).toMatchObject({status: ["active", "cancel_at_period_end"], renewalFrom: "2026-09-27", renewalTo: "2026-10-27"});
    expect(views.due60.renewalTo).toBe("2026-11-26");
    expect(views.due90.renewalTo).toBe("2026-12-26");
    expect(views.pastDue.status).toEqual(["past_due"]);
    expect(views.expired.status).toEqual(["expired"]);
    expect(views.missingData.completeness).toBe("incomplete");
  });
});
