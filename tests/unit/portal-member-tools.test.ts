import {describe, expect, it} from "vitest";

import {MEMBER_TOOLS} from "@/config/member-tools";
import {isToolAvailable, toolFrameSrc} from "@/lib/portal/member-tools";

const tool = MEMBER_TOOLS[0];

describe("member tool availability", () => {
  it("locks a plan the tool does not name", () => {
    expect(isToolAvailable(tool, ["community"])).toBe(false);
  });

  it.each(["startup", "corporate", "patron"] as const)("opens for %s", (plan) => {
    expect(isToolAvailable(tool, [plan])).toBe(true);
  });

  it("admits a member who holds several memberships on any one of them", () => {
    expect(isToolAvailable(tool, ["community", "startup"])).toBe(true);
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
});
