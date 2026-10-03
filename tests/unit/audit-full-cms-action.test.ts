import { afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({
  save: vi.fn(async () => ({
    updated: 1,
    cleared: 0,
    revision: "b".repeat(64),
  })),
  actor: vi.fn(async () => ({
    kind: "staff",
    profileId: "synthetic-staff",
    userId: "synthetic-auth",
  })),
}));
vi.mock("@/lib/auth/actor", () => ({ requireAdminActor: f.actor }));
vi.mock("@/lib/db/repos/page-copy", () => ({ savePageCopy: f.save }));
vi.mock("@/lib/admin/revalidate-path", () => ({
  revalidateAdminPath: vi.fn(),
}));
vi.mock("@/lib/admin/revalidate-public-path", () => ({
  revalidatePublicRoute: vi.fn(),
}));
vi.mock("@/lib/i18n/page-copy-cache", () => ({ clearPageCopyCache: vi.fn() }));
import { savePageCopyAction } from "@/lib/admin/page-copy-actions";
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("blocks the old direct-publish action when server drafts are enabled", async () => {
  vi.stubEnv("CMS_SERVER_DRAFTS_ENABLED", "true");
  const data = new FormData();
  data.set("revision", "a".repeat(64));
  data.set("en:hero.headline", "Synthetic draft");
  const result = await savePageCopyAction(
    "Home",
    "/en/admin/page-copy/Home",
    {
      successMessage: "saved",
      unchangedMessage: "unchanged",
      validationMessage: "invalid",
      errorMessage: "use drafts",
      conflictMessage: "conflict",
    },
    {},
    data,
  );
  expect(f.actor).toHaveBeenCalledOnce();
  expect(f.save).not.toHaveBeenCalled();
  expect(result.status).toBe("error");
});
