import {describe, expect, it} from "vitest";

import {MEMBER_TOOLS} from "@/config/member-tools";
import {isToolAvailable, toolFrameSrc} from "@/lib/portal/member-tools";

const tool = MEMBER_TOOLS[0];

describe("member tool availability", () => {
  it("locks a plan the tool does not name", () => {
    expect(isToolAvailable(tool, [{planCode: "community", status: "active"}])).toBe(false);
  });

  it.each(["startup", "corporate", "patron"] as const)("opens for %s", (plan) => {
    expect(isToolAvailable(tool, [{planCode: plan, status: "active"}])).toBe(true);
  });

  it("admits a member who holds several memberships on any one of them", () => {
    expect(isToolAvailable(tool, [{planCode: "community", status: "active"}, {planCode: "startup", status: "active"}])).toBe(true);
  });

  it.each(["pending_payment", "pending_review"] as const)("locks a %s paid plan", (status) => {
    expect(isToolAvailable(tool, [{planCode: "startup", status}])).toBe(false);
  });

  it.each(["active", "past_due", "cancel_at_period_end"] as const)("honours a %s paid plan", (status) => {
    expect(isToolAvailable(tool, [{planCode: "startup", status}])).toBe(true);
  });
  it("locks a member with no memberships at all", () => {
    expect(isToolAvailable(tool, [])).toBe(false);
  });
});

describe("toolFrameSrc", () => {
  it("appends the token as an encoded query parameter", () => {
    const src = toolFrameSrc(tool, "a b&c");

    expect(new URL(src).searchParams.get(tool.tokenParam)).toBe("a b&c");
    expect(src).not.toContain("a b&c");
  });

  it("keeps the registry's origin", () => {
    expect(new URL(toolFrameSrc(tool, "t")).origin).toBe(new URL(tool.url).origin);
  });

  it("still returns a well-formed URL with an empty token parameter", () => {
    // The page only reaches `toolFrameSrc` with a configured token, but the helper must not
    // depend on that: an empty value yields `?token=` rather than a malformed or tokenless URL.
    const url = new URL(toolFrameSrc(tool, ""));
    expect(url.origin).toBe(new URL(tool.url).origin);
    expect(url.searchParams.get(tool.tokenParam)).toBe("");
  });
});
