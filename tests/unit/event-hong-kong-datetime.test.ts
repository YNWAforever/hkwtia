import {describe, expect, it} from "vitest";

import {eventFormInput, formatHongKongDateTimeLocal, parseHongKongDateTimeLocal} from "@/lib/admin/event-form-input";

describe("Hong Kong event datetime-local conversion", () => {
  it.each([
    ["winter", "2026-01-15T18:00", "2026-01-15T10:00:00.000Z"],
    ["summer", "2026-07-15T18:00", "2026-07-15T10:00:00.000Z"],
    ["year boundary", "2027-01-01T00:30", "2026-12-31T16:30:00.000Z"],
  ])("parses and round-trips %s without using the process timezone", (_label, localValue, utcValue) => {
    const parsed = parseHongKongDateTimeLocal(localValue);
    expect(parsed.toISOString()).toBe(utcValue);
    expect(formatHongKongDateTimeLocal(parsed)).toBe(localValue);
  });

  it("converts admin form datetimes before repository validation", () => {
    const formData = new FormData();
    formData.set("slug", "evening-event");
    formData.set("titleEn", "Evening event");
    formData.set("descriptionEn", "A Hong Kong evening event.");
    formData.set("startsAt", "2026-07-15T18:00");
    formData.set("endsAt", "2026-07-15T20:00");

    const input = eventFormInput(formData);

    expect(input.startsAt).toEqual(new Date("2026-07-15T10:00:00.000Z"));
    expect(input.endsAt).toEqual(new Date("2026-07-15T12:00:00.000Z"));
  });
});
