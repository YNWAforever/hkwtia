import {PgDialect} from "drizzle-orm/pg-core";
import {beforeEach, describe, expect, it, vi} from "vitest";

import * as approvalRoute from "@/app/api/jobs/approvals-expirer/route";
import * as engagementRoute from "@/app/api/jobs/engagement-score/route";
import * as journeyRoute from "@/app/api/jobs/journey-runner/route";
import * as renewalRoute from "@/app/api/jobs/renewal-runner/route";
import * as workerAlertRoute from "@/app/api/jobs/worker-alert/route";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createJobRunnerContextRepository} from "@/lib/db/repos/job-runner-context";
import {
  createStaffAlertRecipientsRepository,
  type StaffAlertRecipientsRepository,
} from "@/lib/db/repos/staff-alert-recipients";
import type {
  AutomationDatabase,
  AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import type {EmailSendInput} from "@/lib/email/transport";
import {
  createJobRunners,
  prepareWorkerAlertRequest,
  sendWorkerAlert,
  type WorkerAlertPayload,
} from "@/lib/jobs/runners";
import {createJobPost} from "@/lib/jobs/handler";

const fixedNow = new Date("2027-01-01T00:00:00.000Z");
const goodPayload = {
  job: "journey-runner",
  scheduledTime: "2027-01-01T00:00:00.000Z",
  attemptCount: 3,
  errorCode: "JOB_HTTP_ERROR",
} as const;

function jsonRequest(
  body: string,
  options: {authorization?: string; contentType?: string; contentLength?: string} = {},
): Request {
  const headers = new Headers();
  if (options.authorization !== undefined) {
    headers.set("authorization", options.authorization);
  }
  if (options.contentType !== undefined) {
    headers.set("content-type", options.contentType);
  }
  if (options.contentLength !== undefined) {
    headers.set("content-length", options.contentLength);
  }
  return new Request("http://localhost/api/jobs/worker-alert", {
    method: "POST",
    headers,
    body,
  });
}

describe("job route exports and security", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "cron-secret";
    vi.restoreAllMocks();
  });

  it.each([
    ["journey", journeyRoute],
    ["renewal", renewalRoute],
    ["engagement", engagementRoute],
    ["approvals", approvalRoute],
    ["worker-alert", workerAlertRoute],
  ])("exports POST and no GET for %s", (_name, route) => {
    expect(typeof route.POST).toBe("function");
    expect("GET" in route).toBe(false);
  });

  it.each([
    journeyRoute.POST,
    renewalRoute.POST,
    engagementRoute.POST,
    approvalRoute.POST,
    workerAlertRoute.POST,
  ])("returns 405 for a non-POST request and 401 for a missing bearer", async (post) => {
    const getResponse = await post(new Request("http://localhost/api/jobs/test", {
      method: "GET",
    }));
    expect(getResponse.status).toBe(405);
    expect(getResponse.headers.get("allow")).toBe("POST");

    const unauthorized = await post(new Request("http://localhost/api/jobs/test", {
      method: "POST",
    }));
    expect(unauthorized.status).toBe(401);
    await expect(unauthorized.json()).resolves.toEqual({error: "UNAUTHORIZED"});
  });
});

describe("production runner composition", () => {
  it("runs both due journeys and frozen campaign recipients in one hourly invocation", async () => {
    const runJourneys = vi.fn(async () => ({claimed: 2, sent: 1}));
    const runCampaigns = vi.fn(async () => ({claimed: 3, sent: 2}));
    const runners = createJobRunners({
      runJourneys,
      runCampaigns,
      runRenewal: vi.fn(),
      runEngagement: vi.fn(),
      runApprovals: vi.fn(),
    });

    await expect(runners.journey(fixedNow)).resolves.toEqual({
      journeys: {claimed: 2, sent: 1},
      campaigns: {claimed: 3, sent: 2},
    });
    expect(runJourneys).toHaveBeenCalledWith(fixedNow);
    expect(runCampaigns).toHaveBeenCalledWith(fixedNow);
  });

  it("exposes the Retention Analyst production runner without coupling it to existing jobs", async () => {
    const runRetentionAnalyst = vi.fn(async () => ({
      considered: 2,
      drafted: 1,
      skippedPending: 0,
      deduplicated: 1,
      failed: 0,
    }));
    const runners = createJobRunners({
      runRetentionAnalyst,
    });

    await expect(
      runners.retentionAnalyst(fixedNow),
    ).resolves.toMatchObject({considered: 2, drafted: 1});
    expect(runRetentionAnalyst).toHaveBeenCalledWith(fixedNow);
  });

  it("waits for both hourly engines before surfacing either failure", async () => {
    let finishCampaign: () => void = () => {
      throw new Error("CAMPAIGN_NOT_STARTED");
    };
    const runJourneys = vi.fn(async () => { throw new Error("private journey failure"); });
    const runCampaigns = vi.fn(() => new Promise((resolve) => {
      finishCampaign = () => resolve({claimed: 1, sent: 1});
    }));
    const runners = createJobRunners({
      runJourneys,
      runCampaigns,
      runRenewal: vi.fn(),
      runEngagement: vi.fn(),
      runApprovals: vi.fn(),
    });

    let settled = false;
    const outcome = runners.journey(fixedNow).then(
      (value) => { settled = true; return {ok: true as const, value}; },
      (error: unknown) => { settled = true; return {ok: false as const, error}; },
    );
    await vi.waitFor(() => {
      expect(runJourneys).toHaveBeenCalledOnce();
      expect(runCampaigns).toHaveBeenCalledOnce();
    });
    const early = await Promise.race([
      outcome.then(() => "settled" as const),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 0)),
    ]);
    expect(early).toBe("pending");

    finishCampaign();
    await expect(outcome).resolves.toMatchObject({ok: false});
    expect(settled).toBe(true);
  });

  it("invokes neither journey side for a duplicate hourly bucket", async () => {
    const runJourneys = vi.fn();
    const runCampaigns = vi.fn();
    const runners = createJobRunners({
      runJourneys,
      runCampaigns,
      runRenewal: vi.fn(),
      runEngagement: vi.fn(),
      runApprovals: vi.fn(),
    });
    const post = createJobPost({
      kind: "journey-runner",
      bucket: "hourly",
      jobs: {
        claim: async () => ({status: "duplicate"}),
        complete: vi.fn(),
        fail: vi.fn(),
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      run: ({now}) => runners.journey(now),
    });

    const response = await post(new Request("http://localhost/api/jobs/journey-runner", {
      method: "POST",
      headers: {authorization: "Bearer cron-secret"},
    }));

    await expect(response.json()).resolves.toEqual({duplicate: true});
    expect(runJourneys).not.toHaveBeenCalled();
    expect(runCampaigns).not.toHaveBeenCalled();
  });
});

describe("worker alert boundary", () => {
  it("accepts only strict JSON and produces a canonical digest run key without raw fields", async () => {
    const prepared = await prepareWorkerAlertRequest(jsonRequest(
      JSON.stringify({
        ...goodPayload,
        scheduledTime: "2027-01-01T08:00:00.000+08:00",
      }),
      {contentType: "application/json; charset=utf-8"},
    ));

    expect(prepared.value).toEqual(goodPayload);
    expect(prepared.runKey).toMatch(/^worker-alert:[a-f0-9]{64}$/);
    expect(prepared.runKey).not.toMatch(/journey|2027|JOB_HTTP_ERROR/i);
    await expect(prepareWorkerAlertRequest(jsonRequest(
      JSON.stringify(goodPayload),
      {contentType: "application/json"},
    ))).resolves.toEqual(prepared);
  });

  it.each([
    ["wrong media type", JSON.stringify(goodPayload), "text/plain", undefined, 415],
    ["malformed JSON", "{", "application/json", undefined, 400],
    ["extra PII field", JSON.stringify({...goodPayload, email: "private@example.test"}), "application/json", undefined, 400],
    ["unknown job", JSON.stringify({...goodPayload, job: "private-job"}), "application/json", undefined, 400],
    ["invalid time", JSON.stringify({...goodPayload, scheduledTime: "tomorrow"}), "application/json", undefined, 400],
    ["zero attempt", JSON.stringify({...goodPayload, attemptCount: 0}), "application/json", undefined, 400],
    ["excess attempt", JSON.stringify({...goodPayload, attemptCount: 4}), "application/json", undefined, 400],
    ["unsafe error code", JSON.stringify({...goodPayload, errorCode: "private@example.test"}), "application/json", undefined, 400],
    ["oversize header", JSON.stringify(goodPayload), "application/json", "5000", 413],
    ["oversize body", JSON.stringify({...goodPayload, padding: "x".repeat(5_000)}), "application/json", undefined, 413],
  ])("rejects %s without claiming or leaking request data", async (
    _name,
    body,
    contentType,
    contentLength,
    status,
  ) => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const post = createJobPost({
      kind: "worker-alert",
      bucket: "hourly",
      jobs: {
        claim: vi.fn(),
        complete: vi.fn(),
        fail: vi.fn(),
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      prepare: prepareWorkerAlertRequest,
      run: vi.fn(),
    });

    const response = await post(jsonRequest(body, {
      authorization: "Bearer cron-secret",
      contentType,
      contentLength,
    }));
    const text = await response.text();

    expect(response.status).toBe(status);
    expect(text).not.toMatch(/private@example|padding|cron-secret/i);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("loads current authorized staff recipients through the system repository and sends branded stable mail", async () => {
    const listCurrent = vi.fn<StaffAlertRecipientsRepository["listCurrent"]>(
      async () => ["staff@example.test", "exco@example.test"],
    );
    const render = vi.fn(async () => ({
      subject: "WTIA automation alert",
      html: "<main>WTIA automation alert</main>",
      text: "WTIA automation alert",
      headers: {},
    }));
    const send = vi.fn(async (input: EmailSendInput) => {
      expect(input.idempotencyKey).toMatch(/^worker-alert:/);
      return {status: "sent" as const, providerId: "provider-id"};
    });

    const summary = await sendWorkerAlert(goodPayload, {
      recipients: {listCurrent},
      render,
      transport: {send},
      emailFrom: "WTIA <operations@example.test>",
    });

    expect(summary).toEqual({recipients: 2, sent: 2, failed: 0});
    expect(listCurrent).toHaveBeenCalledWith(automationCronActor());
    expect(render).toHaveBeenCalledOnce();
    expect(send).toHaveBeenCalledTimes(2);
    const inputs = send.mock.calls.map(([input]) => input);
    expect(inputs.map((input) => input.to)).toEqual([
      "staff@example.test",
      "exco@example.test",
    ]);
    expect(inputs.map((input) => input.idempotencyKey)).toEqual([
      expect.stringMatching(/^worker-alert:[a-f0-9]{64}:[a-f0-9]{64}$/),
      expect.stringMatching(/^worker-alert:[a-f0-9]{64}:[a-f0-9]{64}$/),
    ]);
    expect(inputs[0]?.idempotencyKey).not.toBe(inputs[1]?.idempotencyKey);
    expect(JSON.stringify(summary)).not.toMatch(/@|provider|journey|message/i);
  });

  it("attempts every staff recipient before surfacing a generic delivery failure", async () => {
    const addresses = [
      "first@example.test",
      "second@example.test",
      "third@example.test",
    ];
    const listCurrent = vi.fn<StaffAlertRecipientsRepository["listCurrent"]>(
      async () => addresses,
    );
    const render = vi.fn(async () => ({
      subject: "WTIA automation alert",
      html: "<main>WTIA automation alert</main>",
      text: "WTIA automation alert",
      headers: {},
    }));
    const send = vi.fn(async (input: EmailSendInput) => {
      if (input.to === addresses[0]) {
        throw new Error("provider permanent failure for first@example.test");
      }
      return {status: "sent" as const, providerId: "private-provider-id"};
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const invoke = () => sendWorkerAlert(goodPayload, {
      recipients: {listCurrent},
      render,
      transport: {send},
      emailFrom: "WTIA <operations@example.test>",
    });

    const first = await invoke().then(
      () => null,
      (error: unknown) => error,
    );
    const firstKeys = send.mock.calls.map(([input]) => input.idempotencyKey);
    send.mockClear();
    const second = await invoke().then(
      () => null,
      (error: unknown) => error,
    );
    const secondKeys = send.mock.calls.map(([input]) => input.idempotencyKey);

    expect(first).toBeInstanceOf(Error);
    expect(second).toBeInstanceOf(Error);
    expect((first as Error).message).toBe("WORKER_ALERT_DELIVERY_FAILED");
    expect((second as Error).message).toBe("WORKER_ALERT_DELIVERY_FAILED");
    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls.map(([input]) => input.to)).toEqual(addresses);
    expect(secondKeys).toEqual(firstKeys);
    expect(`${String(first)} ${String(second)}`).not.toMatch(/@|provider|permanent|first/i);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("fails the alert job through the wrapper so a failed claim can be retried safely", async () => {
    let state: "missing" | "processing" | "failed" | "completed" = "missing";
    let attemptCount = 0;
    const fail = vi.fn(async (
      _actor,
      _runKey,
      claimedAttempt: number,
    ) => {
      if (state !== "processing" || claimedAttempt !== attemptCount) return false;
      state = "failed";
      return true;
    });
    const complete = vi.fn(async (
      _actor,
      _runKey,
      claimedAttempt: number,
    ) => {
      if (state !== "processing" || claimedAttempt !== attemptCount) return false;
      state = "completed";
      return true;
    });
    const run = vi.fn()
      .mockRejectedValueOnce(new Error("provider private@example.test"))
      .mockResolvedValueOnce({recipients: 1, sent: 1, failed: 0});
    const post = createJobPost<WorkerAlertPayload>({
      kind: "worker-alert",
      bucket: "hourly",
      jobs: {
        async claim() {
          if (state === "processing" || state === "completed") return {status: "duplicate"} as const;
          attemptCount += 1;
          state = "processing";
          return {status: "claimed", attemptCount} as const;
        },
        complete,
        fail,
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      prepare: prepareWorkerAlertRequest,
      run: ({prepared}) => run(prepared),
    });
    const call = () => post(jsonRequest(JSON.stringify(goodPayload), {
      authorization: "Bearer cron-secret",
      contentType: "application/json",
    }));

    const first = await call();
    const second = await call();

    expect(first.status).toBe(500);
    expect(second.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(2);
    expect(fail).toHaveBeenCalledWith(
      automationCronActor(),
      expect.stringMatching(/^worker-alert:[a-f0-9]{64}$/),
      1,
      "JOB_RUN_FAILED",
    );
    expect(complete).toHaveBeenCalledWith(
      automationCronActor(),
      expect.stringMatching(/^worker-alert:[a-f0-9]{64}$/),
      2,
    );
  });
});

describe("staff alert recipient repository boundary", () => {
  const dialect = new PgDialect();

  function database(rows: Record<string, unknown>[]) {
    const queries: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const execute: AutomationSqlExecutor["execute"] = async (query) => {
      queries.push(dialect.sqlToQuery(query));
      return {rows};
    };
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work(database),
    };
    return {database, queries};
  }

  it("rejects non-automation actors before database access", async () => {
    const loadDatabase = vi.fn(async () => database([]).database);
    const repository = createStaffAlertRecipientsRepository(loadDatabase);

    for (const actor of [
      {kind: "member", userId: "auth-member", profileId: "member-1"},
      {kind: "staff", userId: "auth-staff", profileId: "staff-1"},
      {kind: "system", userId: null, source: "stripe-webhook"},
    ] as const) {
      await expect(repository.listCurrent(actor)).rejects.toMatchObject({code: "FORBIDDEN"});
    }
    expect(loadDatabase).not.toHaveBeenCalled();
  });

  it("selects only current role-authorized nonblank addresses and returns no other profile data", async () => {
    const fixture = database([
      {email: "staff@example.test"},
      {email: "exco@example.test"},
      {email: "superadmin@example.test"},
    ]);
    const repository = createStaffAlertRecipientsRepository(async () => fixture.database);

    await expect(repository.listCurrent(automationCronActor())).resolves.toEqual([
      "exco@example.test",
      "staff@example.test",
      "superadmin@example.test",
    ]);

    const query = fixture.queries[0];
    expect(query?.sql).toMatch(/SELECT .*email.* FROM "profiles"/i);
    expect(query?.sql).toMatch(/role.*IN/i);
    expect(query?.params).toEqual(expect.arrayContaining([
      "staff",
      "exco",
      "superadmin",
    ]));
    expect(query?.sql).not.toMatch(/display_name|phone|auth_user_id|last_login_at/i);
  });
});

describe("job runner context repository boundary", () => {
  it("retains the current profile locale for localized campaign unsubscribe links", async () => {
    const execute: AutomationSqlExecutor["execute"] = async () => ({
      rows: [{consent_marketing: true, email_suppressed: false, locale: "zh-HK"}],
    });
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work(database),
    };
    const repository = createJobRunnerContextRepository(async () => database);

    await expect(repository.loadCampaign(automationCronActor(), "profile-1")).resolves.toEqual({
      marketingConsent: true,
      emailSuppressed: false,
      locale: "zh-HK",
    });
  });
});
