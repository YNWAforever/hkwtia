import {describe, expect, it} from "vitest";

import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";
import {MEMBER_TOOLS, memberToolOrigins} from "@/config/member-tools";
import {entitlementsFor} from "@/lib/membership/entitlements";
import {MEMBERSHIP_PLAN_CODES} from "@/lib/membership/constants";

/**
 * Resolve a dotted path against a message bundle, the way `messages.test.ts` does. Returns
 * `undefined` as soon as any segment is missing or not an object, and only a string leaf
 * resolves — so a typo in `titleKey` cannot be satisfied by a parent namespace.
 */
function messageAt(bundle: unknown, path: string): string | undefined {
  let current = bundle;
  for (const segment of path.split(".")) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return typeof current === "string" ? current : undefined;
}

describe("member tool registry", () => {
  it("is not empty and declares unique keys", () => {
    expect(MEMBER_TOOLS.length).toBeGreaterThan(0);
    const keys = MEMBER_TOOLS.map(({key}) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(MEMBER_TOOLS)("declares a URL-safe key for $key", (tool) => {
    // `key` becomes a `/portal/tools/<key>` path segment and is matched against the route
    // param, so it must stay lowercase, start with a letter, and use no separators but `-`.
    expect(tool.key).toMatch(/^[a-z][a-z0-9-]*$/);
  });

  it.each(MEMBER_TOOLS)("resolves $titleKey in both message bundles", (tool) => {
    // The pages call `t(tool.titleKey)` under the `Portal` namespace; mocked translations and
    // `audit:strings` (JSX literals only) both echo keys rather than resolving them, so a typo
    // would ship the raw key unnoticed without this.
    for (const [locale, bundle] of [["en", en], ["zh-HK", zh]] as const) {
      const value = messageAt(bundle, `Portal.${tool.titleKey}`);
      expect(value, `${locale}: Portal.${tool.titleKey}`).toBeTypeOf("string");
      expect(value?.trim(), `${locale}: Portal.${tool.titleKey}`).not.toBe("");
    }
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
