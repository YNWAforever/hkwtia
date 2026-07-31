import {describe, expect, it} from "vitest";

import {hongKongDateKey} from "@/lib/automation/hong-kong-time";

describe("Hong Kong calendar date key", () => {
  it.each([
    ["before HKT midnight", "2027-03-31T15:59:59.999Z", "2027-03-31"],
    ["at HKT midnight", "2027-03-31T16:00:00.000Z", "2027-04-01"],
  ])("formats %s as a stable YYYY-MM-DD value", (_label, instant, expected) => {
    expect(hongKongDateKey(new Date(instant))).toBe(expected);
  });
});
