import { it, expect, vi, afterEach } from "vitest";
vi.mock("@/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/env")>()),
  aiEnv: vi.fn(() => {
    throw Error("UNAPPROVED_PROVIDER_CONFIGURATION_READ");
  }),
}));
import { runProductionBoardReporter } from "@/lib/jobs/runners";
import { jobHealthEnabled } from "@/lib/jobs/health-registry";
afterEach(() => vi.unstubAllEnvs());
it("keeps board drafting off before reading provider credentials", async () => {
  vi.stubEnv("ADMIN_AI_BOARD_DRAFTS_ENABLED", "false");
  await expect(runProductionBoardReporter(new Date())).resolves.toBeNull();
});
it("reports an explicitly off board capability as disabled", () => {
  expect(
    jobHealthEnabled("board-reporter", {
      AGENTS_ENABLED: "true",
      ADMIN_AI_BOARD_DRAFTS_ENABLED: "false",
    }),
  ).toBe(false);
});
