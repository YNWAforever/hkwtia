import {describe, expect, it} from "vitest";

import nextConfig from "@/next.config";
import {memberToolOrigins} from "@/config/member-tools";

async function contentSecurityPolicy(): Promise<string> {
  const rules = (await nextConfig.headers?.()) ?? [];
  const header = rules
    .flatMap((rule) => rule.headers)
    .find(({key}) => key === "Content-Security-Policy");
  return header?.value ?? "";
}

function frameSrcDirective(value: string): string | undefined {
  return value.split(";").map((part) => part.trim()).find((part) => part.startsWith("frame-src "));
}

describe("member tools CSP", () => {
  it("permits framing of exactly the configured tool origins", async () => {
    expect(memberToolOrigins.length).toBeGreaterThan(0);
    expect(frameSrcDirective(await contentSecurityPolicy())).toBe(`frame-src ${memberToolOrigins.join(" ")}`);
  });

  it("still refuses to be framed itself", async () => {
    // What stops a contributor "fixing" frame-src by removing frame-ancestors, which is
    // what makes the admin approve/publish forms clickjackable.
    expect(await contentSecurityPolicy()).toContain("frame-ancestors 'none'");
  });
});
