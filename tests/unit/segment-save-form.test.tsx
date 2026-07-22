import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import {SegmentSaveFormView} from "@/components/admin/segment-save-form";

describe("accessible segment save state", () => {
  it("renders allowlisted preserved values, field associations, and an aria-live recovery message", () => {
    const html = renderToStaticMarkup(<SegmentSaveFormView
      action={vi.fn()}
      filter={{profileIds: [], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null}}
      labels={{save: "Save", saving: "Saving", nameEn: "English name", nameZh: "Chinese name"}}
      pending={false}
      state={{status: "error", message: "Check the fields", fields: {nameEn: "Renewals", nameZh: "續期"}, fieldErrors: {nameEn: "Check the fields"}}}
    />);
    expect(html).toContain('value="Renewals"');
    expect(html).toContain('value="續期"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="alert"');
  });
});