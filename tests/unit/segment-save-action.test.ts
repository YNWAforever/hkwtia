import {describe, expect, it, vi} from "vitest";

import {runSegmentSaveAction} from "@/lib/admin/segment-action-core";

const messages = {
  success: "Segment saved.",
  validation: "Check the highlighted fields.",
  error: "Unable to save the segment.",
};

function form(entries: Readonly<Record<string, string>>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("safe segment save action", () => {
  it("returns localized field errors and only allowlisted preserved input for malformed filter JSON", async () => {
    const mutate = vi.fn();
    const result = await runSegmentSaveAction({}, form({
      nameEn: "Renewals",
      nameZh: "續期",
      filters: "{private@example.test",
      unexpected: "do-not-return",
    }), {messages, mutate});

    expect(result).toEqual({
      status: "error",
      message: messages.validation,
      fields: {nameEn: "Renewals", nameZh: "續期"},
      fieldErrors: {filter: messages.validation},
    });
    expect(JSON.stringify(result)).not.toContain("private@example.test");
    expect(JSON.stringify(result)).not.toContain("do-not-return");
    expect(mutate).not.toHaveBeenCalled();
  });

  it("safe-parses strict input and returns only localized success state", async () => {
    const mutate = vi.fn(async () => ({id: "private-segment-id"}));
    const result = await runSegmentSaveAction({}, form({
      nameEn: " Renewals ",
      nameZh: " ",
      filters: JSON.stringify({tier: ["corporate"]}),
    }), {messages, mutate});

    expect(mutate).toHaveBeenCalledWith({
      nameEn: "Renewals",
      nameZh: null,
      filter: {
        profileIds: [], tier: ["corporate"], status: [], scoreMin: null, scoreMax: null,
        renewalWithinDays: null, sector: "", lastLoginBeforeDays: null,
      },
    });
    expect(result).toEqual({status: "success", message: messages.success, fields: {nameEn: "", nameZh: ""}});
    expect(JSON.stringify(result)).not.toContain("private-segment-id");
  });

  it("maps repository failures to a generic localized error without raw payload leakage", async () => {
    const result = await runSegmentSaveAction({}, form({
      nameEn: "Renewals",
      nameZh: "",
      filters: JSON.stringify({tier: []}),
    }), {messages, mutate: async () => { throw new Error("private@example.test database failure"); }});

    expect(result).toEqual({status: "error", message: messages.error, fields: {nameEn: "Renewals", nameZh: ""}});
    expect(JSON.stringify(result)).not.toContain("private@example.test");
  });
});