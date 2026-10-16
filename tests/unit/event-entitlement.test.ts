import {describe, expect, it} from "vitest";

import {assertCanSubmitEvent, EventEntitlementError} from "@/lib/events/entitlement-core";

describe("assertCanSubmitEvent (programme D-5)", () => {
  it("blocks community, caps startup at 2 per quarter, never caps corporate", () => {
    expect(() => assertCanSubmitEvent("community", 0)).toThrow(EventEntitlementError);
    expect(() => assertCanSubmitEvent("startup", 1)).not.toThrow();
    expect(() => assertCanSubmitEvent("startup", 2)).toThrow("EVENT_QUOTA_EXCEEDED");
    expect(() => assertCanSubmitEvent("corporate", 500)).not.toThrow();
    expect(() => assertCanSubmitEvent("patron", 500)).not.toThrow();
  });

  it("reports the code that blocked", () => {
    try {
      assertCanSubmitEvent("community", 0);
      throw new Error("expected EventEntitlementError");
    } catch (error) {
      expect(error).toBeInstanceOf(EventEntitlementError);
      expect((error as EventEntitlementError).code).toBe("EVENT_PUBLISHING_NOT_INCLUDED");
      expect((error as EventEntitlementError).plan).toBe("community");
      expect((error as EventEntitlementError).limit).toBe(0);
    }
  });
});
