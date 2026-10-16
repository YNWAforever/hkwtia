import { afterEach, it, expect, vi } from "vitest";
vi.mock("@/lib/config/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config/env")>()),
  aiEnv: vi.fn(() => {
    throw Error("UNAPPROVED_PROVIDER_CONFIGURATION_READ");
  }),
}));
import { runProductionRetentionAnalyst } from "@/lib/jobs/runners";
afterEach(() => vi.unstubAllEnvs());
it("keeps the new retention capability off without reading model credentials or creating work", async () => {
  vi.stubEnv("ADMIN_AI_RETENTION_DRAFTS_ENABLED", "false");
  await expect(runProductionRetentionAnalyst(new Date())).resolves.toEqual({
    considered: 0,
    drafted: 0,
    skippedPending: 0,
    deduplicated: 0,
    failed: 0,
  });
});

it('reports a disabled retention capability instead of unknown worker failure',async()=>{
 const {jobHealthEnabled}=await import('@/lib/jobs/health-registry');
 expect(jobHealthEnabled('retention-analyst',{AGENTS_ENABLED:'true',ADMIN_AI_RETENTION_DRAFTS_ENABLED:'false'})).toBe(false);
 expect(jobHealthEnabled('retention-analyst',{AGENTS_ENABLED:'false',ADMIN_AI_RETENTION_DRAFTS_ENABLED:'true'})).toBe(false);
 expect(jobHealthEnabled('retention-analyst',{AGENTS_ENABLED:'true',ADMIN_AI_RETENTION_DRAFTS_ENABLED:'true'})).toBe(true);
});
