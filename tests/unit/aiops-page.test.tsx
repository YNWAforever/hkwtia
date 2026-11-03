import {describe, expect, it, vi} from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import AiOpsPage, {generateMetadata} from "@/app/[locale]/(public)/ai-ops/page";

describe("AI-Ops public page", () => {
  it("is not a public page", async () => {
    await expect(AiOpsPage({params: Promise.resolve({locale: "en"})})).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(generateMetadata({params: Promise.resolve({locale: "en"})})).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
