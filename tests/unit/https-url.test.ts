import {describe, expect, it} from "vitest";

import {canonicalHttpsUrl} from "@/lib/security/https-url";

describe("canonical HTTPS URL policy", () => {
  it("returns a canonical HTTPS href without fetching", () => {
    expect(canonicalHttpsUrl("https://Example.COM/path")).toBe("https://example.com/path");
    expect(canonicalHttpsUrl("https://例子.香港/合作")).toBe("https://xn--fsqu00a.xn--j6w193g/%E5%90%88%E4%BD%9C");
  });

  it.each([
    " https://example.com", "https://example.com ", "https://example.com/e\u0301",
    "http://example.com", "https://user@example.com", "https://example.com:443",
    "https://example.com/?q=1", "https://example.com/#top", "https://127.0.0.1",
    "https://[::1]", "https://localhost", "https://sub.localhost/path",
    "https://localhost./", "https://sub.localhost./path",
    "https://example.com/\u0000", "https://example.com/\u202Ebad", "",
  ])("rejects unsafe or non-canonical input %j", (value) => {
    expect(() => canonicalHttpsUrl(value)).toThrow("HTTPS_URL_INVALID");
  });

  it("enforces the exact 2048-code-point bound", () => {
    const prefix = "https://example.com/";
    expect(canonicalHttpsUrl(prefix + "a".repeat(2048 - prefix.length))).toHaveLength(2048);
    expect(() => canonicalHttpsUrl(prefix + "a".repeat(2049 - prefix.length)))
      .toThrow("HTTPS_URL_INVALID");
  });
});
