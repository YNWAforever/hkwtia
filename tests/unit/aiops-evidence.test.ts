import {describe, expect, it} from "vitest";

import {AI_OPS_EXTERNAL_EVIDENCE} from "@/config/aiops-evidence";

describe("AI-Ops external evidence contract", () => {
  it("exports exactly the approved fixed evidence list", () => {
    expect(AI_OPS_EXTERNAL_EVIDENCE).toEqual([
      {id: "source", href: "https://github.com/YNWAforever/hkwtia"},
      {id: "commits", href: "https://github.com/YNWAforever/hkwtia/commits/main"},
      {id: "deployment", href: "https://hkwtia.vercel.app"},
      {id: "acceptance", href: "https://github.com/YNWAforever/hkwtia/blob/main/docs/acceptance/m4.md"},
    ]);
  });

  it("deeply freezes evidence entries after validating safe HTTPS URLs", () => {
    expect(Object.isFrozen(AI_OPS_EXTERNAL_EVIDENCE)).toBe(true);

    for (const evidence of AI_OPS_EXTERNAL_EVIDENCE) {
      const url = new URL(evidence.href);
      expect(Object.isFrozen(evidence)).toBe(true);
      expect(url.protocol).toBe("https:");
      expect(url.username).toBe("");
      expect(url.password).toBe("");
      expect(url.hostname).not.toBe("");
    }
  });
});
