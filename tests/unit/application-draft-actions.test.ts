import { beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => vi.fn());
const prepare = vi.hoisted(() => vi.fn());
const adopt = vi.hoisted(() => vi.fn());
vi.mock("@/lib/admin/application-case-service", () => ({
  adoptApplicationDraft: adopt,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/actor", () => ({ requireAdminActor: auth }));
vi.mock("@/lib/ai/application-triage", () => ({
  prepareApplicationDraft: prepare,
}));
import {
  prepareApplicationDraftAction,
  adoptApplicationDraftAction,
} from "@/lib/admin/application-draft-actions";
const actor = {
    kind: "staff",
    profileId: "synthetic-staff",
    userId: "synthetic-auth",
  } as const,
  id = "10000000-0000-4000-8000-000000000001",
  draft = "10000000-0000-4000-8000-000000000002";
describe("application draft action owns its actor and recovers without effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue(actor);
    prepare.mockResolvedValue({ id: draft, state: "needs_review" });
  });
  it("uses its authenticated actor and canonical HK review URL", async () => {
    expect(await prepareApplicationDraftAction(id, "zh-HK")).toEqual({
      status: "created",
      reviewHref: "/zh/admin/tasks?draft=" + draft,
    });
    expect(prepare).toHaveBeenCalledWith(actor, id);
  });
  it("rejects authorization before generation", async () => {
    auth.mockRejectedValue(Error("FORBIDDEN"));
    expect(await prepareApplicationDraftAction(id, "en")).toEqual({
      status: "forbidden",
    });
    expect(prepare).not.toHaveBeenCalled();
  });
  it.each([
    ["DRAFT_GENERATION_DISABLED", "disabled"],
    ["AGENT_ROUTE_UNAPPROVED", "configuration"],
    ["DRAFT_GENERATION_UNKNOWN_EFFECT", "unknown"],
    ["DRAFT_GENERATION_BUSY", "busy"],
    ["DRAFT_GENERATION_STALE", "stale"],
  ])("recovers %s as %s", async (code, status) => {
    prepare.mockRejectedValue(Error(code));
    expect(await prepareApplicationDraftAction(id, "en")).toEqual({ status });
  });
  it("invalid case/locale cannot fall through or introduce external URLs", async () => {
    expect(await prepareApplicationDraftAction("wrong", "en")).toEqual({
      status: "invalid",
    });
    expect(
      await prepareApplicationDraftAction(id, "zh-HK/evil" as never),
    ).toEqual({ status: "invalid" });
    expect(prepare).not.toHaveBeenCalled();
  });
});

describe("application adoption action", () => {
  const input = {
    draftId: draft,
    expectedVersion: 2,
    expectedCaseVersion: "0",
  };
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ADMIN_AI_DRAFTS_ENABLED", "true");
    auth.mockResolvedValue(actor);
    adopt.mockResolvedValue({ status: "adopted", value: { version: draft } });
  });
  it("uses its own actor for the note-only existing writer", async () => {
    expect(await adoptApplicationDraftAction(id, "zh-HK", input)).toEqual({
      status: "adopted",
    });
    expect(adopt).toHaveBeenCalledWith(actor, id, input);
  });
  it("denies missing authorization before adoption", async () => {
    auth.mockRejectedValue(Error("FORBIDDEN"));
    expect(await adoptApplicationDraftAction(id, "en", input)).toEqual({
      status: "forbidden",
    });
    expect(adopt).not.toHaveBeenCalled();
  });
  it("keeps the default review gate closed", async () => {
    vi.stubEnv("ADMIN_AI_DRAFTS_ENABLED", "false");
    expect(await adoptApplicationDraftAction(id, "en", input)).toEqual({
      status: "disabled",
    });
    expect(adopt).not.toHaveBeenCalled();
  });
  it("rejects role/actor injection and malformed versions", async () => {
    expect(
      await adoptApplicationDraftAction(id, "en", {
        ...input,
        role: "superadmin",
      }),
    ).toEqual({ status: "invalid" });
    expect(
      await adoptApplicationDraftAction(id, "en", {
        ...input,
        expectedVersion: 0,
      }),
    ).toEqual({ status: "invalid" });
    expect(adopt).not.toHaveBeenCalled();
  });
  it("returns stale without reporting adoption", async () => {
    adopt.mockResolvedValue({ status: "stale" });
    expect(await adoptApplicationDraftAction(id, "en", input)).toEqual({
      status: "stale",
    });
  });
});
