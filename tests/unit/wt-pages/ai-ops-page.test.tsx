import {describe, expect, it} from "vitest";

import AiOpsPage from "@/app/[locale]/(public)/ai-ops/page";

describe("AI-Ops page", () => {
  it("is hidden from the public site", async () => {
    await expect(AiOpsPage({params: Promise.resolve({locale: "en"})})).rejects.toThrow(/NEXT_HTTP_ERROR_FALLBACK|NEXT_NOT_FOUND/);
  });
});
