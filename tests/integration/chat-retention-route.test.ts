import {describe, expect, it, vi} from "vitest";

import {
  POST,
  createChatRetentionPost,
} from "@/lib/api/jobs/chat-retention-route";
import {automationCronActor} from "@/lib/auth/automation-actor";
import type {ChatRetentionRepository} from "@/lib/ai/retention";
import {M4_AI_JOB_KIND} from "@/lib/jobs/kinds";

const fixedNow = new Date("2026-07-28T03:15:00.000Z");

function repository(): ChatRetentionRepository {
  return {
    inspect: vi.fn(async () => ({
      messages: 7,
      runsToRedact: 2,
      runsToUnlink: 1,
      emptyConversations: 1,
    })),
    redactRunsBatch: vi.fn(async () => 0),
    deleteMessagesBatch: vi.fn(async () => 0),
    removeEmptyConversationsBatch: vi.fn(async () => ({
      conversationsDeleted: 0,
      runsUnlinked: 0,
      runsRedacted: 0,
    })),
  };
}

function request(
  query = "",
  authorization?: string,
  method = "POST",
): Request {
  return new Request(
    `http://localhost/api/jobs/chat-retention${query}`,
    {
      method,
      headers: authorization ? {authorization} : undefined,
    },
  );
}

describe("chat retention job route", () => {
  it("exports POST only and enforces the existing cron bearer contract", async () => {
    expect(typeof POST).toBe("function");
    const route = createChatRetentionPost({
      repository: repository(),
      secret: () => "cron-secret",
      now: () => fixedNow,
    });

    const wrongMethod = await route(request("", "Bearer cron-secret", "GET"));
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");

    const unauthorized = await route(request());
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({
      error: "UNAUTHORIZED",
    });
  });

  it("uses a distinct daily M4 job kind and returns stable dry-run JSON", async () => {
    const claim = vi.fn(async () => ({
      status: "claimed" as const,
      attemptCount: 1,
    }));
    const complete = vi.fn(async () => true);
    const fail = vi.fn(async () => true);
    const repo = repository();
    const route = createChatRetentionPost({
      repository: repo,
      jobs: {claim, complete, fail},
      secret: () => "cron-secret",
      now: () => fixedNow,
    });

    const response = await route(
      request("?dryRun=true", "Bearer cron-secret"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      duplicate: false,
      summary: {
        dryRun: true,
        messagesDeleted: 7,
        runsRedacted: 2,
        runsUnlinked: 1,
        conversationsDeleted: 1,
        batches: 0,
        truncated: false,
      },
    });
    expect(claim).toHaveBeenCalledWith(
      automationCronActor(),
      "chat-retention:dry-run:2026-07-28",
      M4_AI_JOB_KIND.CHAT_RETENTION,
    );
    expect(complete).toHaveBeenCalledWith(
      automationCronActor(),
      "chat-retention:dry-run:2026-07-28",
      1,
    );
    expect(repo.redactRunsBatch).not.toHaveBeenCalled();
    expect(repo.deleteMessagesBatch).not.toHaveBeenCalled();
    expect(repo.removeEmptyConversationsBatch).not.toHaveBeenCalled();
  });

  it("persists one daily run key so retries are duplicate operational jobs", async () => {
    let claimed = false;
    const claim = vi.fn(async () => {
      if (claimed) return {status: "duplicate" as const};
      claimed = true;
      return {status: "claimed" as const, attemptCount: 1};
    });
    const complete = vi.fn(async () => true);
    const repo = repository();
    const route = createChatRetentionPost({
      repository: repo,
      jobs: {claim, complete, fail: vi.fn(async () => true)},
      secret: () => "cron-secret",
      now: () => fixedNow,
    });

    const first = await route(request("", "Bearer cron-secret"));
    const retry = await route(request("", "Bearer cron-secret"));

    await expect(first.json()).resolves.toMatchObject({
      duplicate: false,
      summary: {dryRun: false},
    });
    await expect(retry.json()).resolves.toEqual({duplicate: true});
    expect(claim).toHaveBeenNthCalledWith(
      1,
      automationCronActor(),
      "chat-retention:2026-07-28",
      M4_AI_JOB_KIND.CHAT_RETENTION,
    );
    expect(claim).toHaveBeenNthCalledWith(
      2,
      automationCronActor(),
      "chat-retention:2026-07-28",
      M4_AI_JOB_KIND.CHAT_RETENTION,
    );
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("rejects unsupported query parameters before claiming a job", async () => {
    const claim = vi.fn();
    const route = createChatRetentionPost({
      repository: repository(),
      jobs: {
        claim,
        complete: vi.fn(),
        fail: vi.fn(),
      },
      secret: () => "cron-secret",
      now: () => fixedNow,
    });

    const response = await route(
      request("?dryRun=maybe", "Bearer cron-secret"),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "INVALID_RETENTION_REQUEST",
    });
    expect(claim).not.toHaveBeenCalled();
  });
});


describe("chat retention concurrent idempotency", () => {
  it("lets one daily claim mutate while a concurrent retry is a duplicate", async () => {
    let state: "missing" | "processing" | "completed" = "missing";
    let release: () => void = () => {
      throw new Error("RETENTION_NOT_STARTED");
    };
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    let unblock: () => void = () => {
      throw new Error("UNBLOCK_NOT_READY");
    };
    const blocked = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    const repo = {
      ...repository(),
      redactRunsBatch: vi.fn(async () => {
        release();
        await blocked;
        return 0;
      }),
    };
    const claim = vi.fn(async () => {
      if (state !== "missing") return {status: "duplicate" as const};
      state = "processing";
      return {status: "claimed" as const, attemptCount: 1};
    });
    const complete = vi.fn(async () => {
      state = "completed";
      return true;
    });
    const route = createChatRetentionPost({
      repository: repo,
      jobs: {claim, complete, fail: vi.fn(async () => true)},
      secret: () => "cron-secret",
      now: () => fixedNow,
    });
    const first = route(request("", "Bearer cron-secret"));
    await started;
    const retry = await route(request("", "Bearer cron-secret"));
    await expect(retry.json()).resolves.toEqual({duplicate: true});
    unblock();
    await expect((await first).json()).resolves.toMatchObject({
      duplicate: false,
      summary: {dryRun: false},
    });
    expect(repo.redactRunsBatch).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
});
