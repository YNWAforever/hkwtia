import {describe, expect, it} from "vitest";

import {MEMBER_TOOLS, memberToolOrigins} from "@/config/member-tools";
import {entitlementsFor} from "@/lib/membership/entitlements";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

describe("member tool registry", () => {
  it("is not empty and declares unique keys", () => {
    expect(MEMBER_TOOLS.length).toBeGreaterThan(0);
    const keys = MEMBER_TOOLS.map(({key}) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(MEMBER_TOOLS)("declares a safe, tokenless origin for $key", (tool) => {
    expect(tool.titleKey).toMatch(/\S/);
    expect(tool.tokenParam).toMatch(/^[a-z][a-z0-9_-]*$/);

    const url = new URL(tool.url);
    // https only, and the URL carries no credential of its own: the token is injected at
    // render time from the environment, never stored beside the origin.
    expect(url.protocol).toBe("https:");
    expect(url.username).toBe("");
    expect(url.password).toBe("");
    expect(url.search).toBe("");
    expect(url.hash).toBe("");
  });

  it.each(MEMBER_TOOLS)("names only entitled plans for $key", (tool) => {
    expect(tool.tiers.length).toBeGreaterThan(0);
    for (const plan of tool.tiers) {
      expect(MEMBERSHIP_PLAN_CODES).toContain(plan);
      // The one place the registry and the entitlements are held together. A tool may only
      // name a plan the entitlements actually grant member tools to.
      expect(entitlementsFor(plan).memberTools).toBe("included");
    }
  });

  it("publishes exactly the origins the tools declare, deduplicated", () => {
    expect(memberToolOrigins).toEqual([...new Set(MEMBER_TOOLS.map(({url}) => new URL(url).origin))]);
    for (const tool of MEMBER_TOOLS) {
      expect(memberToolOrigins).toContain(new URL(tool.url).origin);
    }
  });

  it("is frozen", () => {
    expect(Object.isFrozen(MEMBER_TOOLS)).toBe(true);
    for (const tool of MEMBER_TOOLS) expect(Object.isFrozen(tool)).toBe(true);
  });
});
