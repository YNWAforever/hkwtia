import {describe,expect,it} from "vitest";
import {m2ProtectedPath} from "@/tests/fixtures/m2-session-reuse";

describe("terminal member authentication probe", () => {
  it("uses authorized billing history without requiring membership entitlements", () => {
    expect(m2ProtectedPath(true,"/")).toBe("/portal/billing");
    expect(m2ProtectedPath(true,"/zh")).toBe("/zh/portal/billing");
  });
});
