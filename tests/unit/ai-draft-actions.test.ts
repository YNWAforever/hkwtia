// @vitest-environment node
import { beforeEach, describe, it, expect, vi } from "vitest";
import { AuthorizationError } from "@/lib/membership/lifecycle";
const mocks = vi.hoisted(() => ({
  actor: vi.fn(),
  review: vi.fn(),
  edit: vi.fn(),
}));
vi.mock("@/lib/auth/actor", () => ({ requireAdminActor: mocks.actor }));
vi.mock("@/lib/db/repos/ai-drafts", async () => ({
  ...(await vi.importActual<typeof import("@/lib/db/repos/ai-drafts")>(
    "@/lib/db/repos/ai-drafts",
  )),
  aiDraftsRepository: { reviewDraft: mocks.review, editDraft: mocks.edit },
}));
import {
  reviewAiDraftAction,
  editAiDraftAction,
} from "@/lib/admin/ai-draft-actions";
const actor = {
  kind: "staff",
  profileId: "synthetic-trusted",
  userId: "synthetic-auth",
} as const;
const version = {
  draftId: "00000000-0000-4000-8000-000000000008",
  expectedVersion: 2,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ADMIN_AI_DRAFTS_ENABLED", "true");
  mocks.actor.mockResolvedValue(actor);
  mocks.review.mockResolvedValue({ status: "reviewed" });
  mocks.edit.mockResolvedValue({});
});
describe("draft actions use their own trusted actor and never send", () => {
  it.each([
    [reviewAiDraftAction, { ...version, decision: "approve" }],
    [editAiDraftAction, { ...version, body: "Please contact staff." }],
  ] as const)(
    "denies a missing authenticated actor before repository access",
    async (action, input) => {
      mocks.actor.mockRejectedValue(new AuthorizationError());
      expect(await action(input)).toEqual({ status: "forbidden" });
      expect(mocks.review).not.toHaveBeenCalled();
      expect(mocks.edit).not.toHaveBeenCalled();
    },
  );
  it("rejects a client role/actor even after loading the trusted actor", async () => {
    expect(
      await reviewAiDraftAction({
        ...version,
        decision: "approve",
        actor: { kind: "superadmin", profileId: "forged" },
      }),
    ).toEqual({ status: "invalid" });
    expect(mocks.actor).toHaveBeenCalledOnce();
    expect(mocks.review).not.toHaveBeenCalled();
  });
  it("sends only strict input plus its trusted actor to review", async () => {
    expect(
      await reviewAiDraftAction({ ...version, decision: "approve" }),
    ).toEqual({ status: "saved" });
    expect(mocks.review).toHaveBeenCalledWith(actor, {
      ...version,
      decision: "approve",
    });
  });
  it("closed feature still authenticates and performs no write", async () => {
    vi.stubEnv("ADMIN_AI_DRAFTS_ENABLED", "false");
    expect(
      await editAiDraftAction({ ...version, body: "Please contact staff." }),
    ).toEqual({ status: "disabled" });
    expect(mocks.actor).toHaveBeenCalledOnce();
    expect(mocks.edit).not.toHaveBeenCalled();
  });
  it("CAS conflict, unavailable facts and committed stale have distinct content-free recovery", async () => {
    mocks.review
      .mockRejectedValueOnce(Error("AI_DRAFT_VERSION_CONFLICT"))
      .mockRejectedValueOnce(Error("AI_DRAFT_FACT_READER_UNAVAILABLE"))
      .mockResolvedValueOnce({ status: "stale" });
    expect(
      await reviewAiDraftAction({ ...version, decision: "approve" }),
    ).toEqual({ status: "invalid" });
    expect(
      await reviewAiDraftAction({ ...version, decision: "approve" }),
    ).toEqual({ status: "configuration" });
    expect(
      await reviewAiDraftAction({ ...version, decision: "approve" }),
    ).toEqual({ status: "stale" });
  });
});
