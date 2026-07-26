import {beforeEach, describe, expect, it, vi} from "vitest";

import {
  JobRequestError,
  createJobPost,
  runKeyFor,
  type JobHandlerRepository,
} from "@/lib/jobs/handler";

const fixedNow = new Date("2027-01-01T00:00:00.000Z");

function repository() {
  const records = new Map<string, {
    state: "processing" | "completed" | "failed";
    attemptCount: number;
  }>();
  const repo: JobHandlerRepository = {
    async claim(_actor, runKey) {
      const record = records.get(runKey);
      if (record && record.state !== "failed") return {status: "duplicate"};
      const attemptCount = (record?.attemptCount ?? 0) + 1;
      records.set(runKey, {state: "processing", attemptCount});
      return {status: "claimed", attemptCount};
    },
    async complete(_actor, runKey, attemptCount) {
      const record = records.get(runKey);
      if (!record || record.state !== "processing" || record.attemptCount !== attemptCount) return false;
      records.set(runKey, {...record, state: "completed"});
      return true;
    },
    async fail(_actor, runKey, attemptCount) {
      const record = records.get(runKey);
      if (!record || record.state !== "processing" || record.attemptCount !== attemptCount) return false;
      records.set(runKey, {...record, state: "failed"});
      return true;
    },
  };
  return {records, repo};
}

function invoke(
  post: (request: Request) => Promise<Response>,
  options: {method?: string; authorization?: string} = {},
): Promise<Response> {
  const headers: HeadersInit = options.authorization === undefined
    ? {}
    : {authorization: options.authorization};
  return post(new Request("http://localhost/api/jobs/test-job", {
    method: options.method ?? "POST",
    headers,
  }));
}

describe("secured idempotent job handler", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns POST-only 405 semantics before authentication", async () => {
    const jobs = repository();
    const run = vi.fn();
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: jobs.repo,
      now: () => fixedNow,
      secret: () => "cron-secret",
      run,
    });

    const response = await invoke(post, {method: "GET"});

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(jobs.records).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "Bearer wrong-value",
    "Bearer short",
    "Basic cron-secret",
  ])("returns a generic 401 for missing, wrong, or malformed bearer %s", async (authorization) => {
    const jobs = repository();
    const run = vi.fn();
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: jobs.repo,
      now: () => fixedNow,
      secret: () => "cron-secret",
      run,
    });

    const response = await invoke(post, {authorization});

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({error: "UNAUTHORIZED"});
    expect(jobs.records).toHaveLength(0);
    expect(run).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])(
    "rejects a missing or empty configured secret without claiming a job",
    async (configuredSecret) => {
      const jobs = repository();
      const post = createJobPost({
        kind: "test-job",
        bucket: "hourly",
        jobs: jobs.repo,
        now: () => fixedNow,
        secret: () => configuredSecret,
        run: vi.fn(),
      });

      const response = await invoke(post, {authorization: "Bearer cron-secret"});

      expect(response.status).toBe(401);
      expect(jobs.records).toHaveLength(0);
    },
  );

  it("captures one explicit valid now and passes the automation-cron system actor", async () => {
    const claim = vi.fn<JobHandlerRepository["claim"]>(async () => ({status: "claimed", attemptCount: 7}));
    const complete = vi.fn<JobHandlerRepository["complete"]>(async () => true);
    const now = vi.fn(() => fixedNow);
    const run = vi.fn(async ({now: runNow}) => ({processed: runNow === fixedNow ? 1 : 0}));
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {claim, complete, fail: vi.fn()},
      now,
      secret: () => "cron-secret",
      run,
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});

    expect(response.status).toBe(200);
    expect(now).toHaveBeenCalledOnce();
    expect(claim).toHaveBeenCalledWith(
      {kind: "system", userId: null, source: "automation-cron"},
      "test-job:2027-01-01T00",
      "test-job",
    );
    expect(run).toHaveBeenCalledWith(expect.objectContaining({now: fixedNow}));
    expect(complete).toHaveBeenCalledWith(
      {kind: "system", userId: null, source: "automation-cron"},
      "test-job:2027-01-01T00",
      7,
    );
  });

  it("rejects an invalid clock value before repository access", async () => {
    const claim = vi.fn<JobHandlerRepository["claim"]>();
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {claim, complete: vi.fn(), fail: vi.fn()},
      now: () => new Date(Number.NaN),
      secret: () => "cron-secret",
      run: vi.fn(),
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({error: "JOB_RUN_FAILED"});
    expect(claim).not.toHaveBeenCalled();
  });

  it("builds stable hourly and daily UTC keys across calendar boundaries", () => {
    expect(runKeyFor(
      "journey-runner",
      "hourly",
      new Date("2026-12-31T23:59:59.999Z"),
    )).toBe("journey-runner:2026-12-31T23");
    expect(runKeyFor(
      "journey-runner",
      "hourly",
      new Date("2027-01-01T00:00:00.000+00:00"),
    )).toBe("journey-runner:2027-01-01T00");
    expect(runKeyFor(
      "renewal-runner",
      "daily",
      new Date("2027-01-01T07:59:59.999+08:00"),
    )).toBe("renewal-runner:2026-12-31");
    expect(runKeyFor(
      "renewal-runner",
      "daily",
      new Date("2027-01-01T08:00:00.000+08:00"),
    )).toBe("renewal-runner:2027-01-01");
  });

  it("returns duplicate:true without invoking or completing the runner", async () => {
    const run = vi.fn();
    const complete = vi.fn();
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {claim: async () => ({status: "duplicate"}), complete, fail: vi.fn()},
      now: () => fixedNow,
      secret: () => "cron-secret",
      run,
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({duplicate: true});
    expect(run).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it("allows only one runner under concurrent duplicate requests for one bucket", async () => {
    const jobs = repository();
    const run = vi.fn(async () => ({processed: 1}));
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: jobs.repo,
      now: () => fixedNow,
      secret: () => "cron-secret",
      run,
    });
    const request = () => invoke(post, {authorization: "Bearer cron-secret"});

    const [first, second] = await Promise.all([request(), request()]);
    const bodies = await Promise.all([first.json(), second.json()]);

    expect(bodies).toContainEqual({duplicate: true});
    expect(bodies).toContainEqual({duplicate: false, summary: {processed: 1}});
    expect(run).toHaveBeenCalledOnce();
  });

  it("returns only a bounded numeric summary and drops recipient, provider, secret, and body data", async () => {
    const jobs = repository();
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: jobs.repo,
      now: () => fixedNow,
      secret: () => "cron-secret",
      run: async () => ({
        processed: 1,
        recipient: "private@example.test",
        providerId: "provider-private",
        secret: "cron-secret",
        messageBody: "private message",
        errors: {SAFE_ERROR: 2, raw: "private@example.test"},
      }),
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({
      duplicate: false,
      summary: {processed: 1, errors: {SAFE_ERROR: 2}},
    });
    expect(text).not.toMatch(/private|provider|cron-secret|message/i);
    expect(text.length).toBeLessThan(4_096);
  });

  it("fails the claimed job with one bounded safe code and never leaks thrown data", async () => {
    const fail = vi.fn<JobHandlerRepository["fail"]>(async () => true);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {claim: async () => ({status: "claimed", attemptCount: 4}), complete: vi.fn(), fail},
      now: () => fixedNow,
      secret: () => "cron-secret",
      run: async () => {
        throw new Error("cron-secret private@example.test provider-private full message body");
      },
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(JSON.parse(text)).toEqual({error: "JOB_RUN_FAILED"});
    expect(fail).toHaveBeenCalledWith(
      {kind: "system", userId: null, source: "automation-cron"},
      "test-job:2027-01-01T00",
      4,
      "JOB_RUN_FAILED",
    );
    expect(text).not.toMatch(/cron-secret|private|provider|message/i);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("returns a bounded stale response when completion no longer owns the processing attempt", async () => {
    const fail = vi.fn<JobHandlerRepository["fail"]>();
    const complete = vi.fn<JobHandlerRepository["complete"]>(async () => false);
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {
        claim: async () => ({status: "claimed", attemptCount: 2}),
        complete,
        fail,
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      run: async () => ({processed: 1}),
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({stale: true});
    expect(complete).toHaveBeenCalledWith(
      {kind: "system", userId: null, source: "automation-cron"},
      "test-job:2027-01-01T00",
      2,
    );
    expect(fail).not.toHaveBeenCalled();
  });

  it("does not overwrite a committed completion when its database response is lost", async () => {
    const complete = vi.fn<JobHandlerRepository["complete"]>(async () => {
      throw new Error("private completion transport failure");
    });
    const fail = vi.fn<JobHandlerRepository["fail"]>(async () => false);
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {
        claim: async () => ({status: "claimed", attemptCount: 5}),
        complete,
        fail,
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      run: async () => ({processed: 1, recipient: "private@example.test"}),
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text)).toEqual({stale: true});
    expect(fail).toHaveBeenCalledWith(
      {kind: "system", userId: null, source: "automation-cron"},
      "test-job:2027-01-01T00",
      5,
      "JOB_RUN_FAILED",
    );
    expect(text).not.toMatch(/private|recipient|transport/i);
  });

  it("returns a bounded stale response when an old failed runner loses its attempt fence", async () => {
    const fail = vi.fn<JobHandlerRepository["fail"]>(async () => false);
    const post = createJobPost({
      kind: "test-job",
      bucket: "hourly",
      jobs: {
        claim: async () => ({status: "claimed", attemptCount: 1}),
        complete: vi.fn(),
        fail,
      },
      now: () => fixedNow,
      secret: () => "cron-secret",
      run: async () => {
        throw new Error("private stale worker error");
      },
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({stale: true});
    expect(fail).toHaveBeenCalledWith(
      {kind: "system", userId: null, source: "automation-cron"},
      "test-job:2027-01-01T00",
      1,
      "JOB_RUN_FAILED",
    );
  });

  it("returns safe request validation errors before claiming", async () => {
    const claim = vi.fn<JobHandlerRepository["claim"]>();
    const post = createJobPost({
      kind: "worker-alert",
      bucket: "hourly",
      jobs: {claim, complete: vi.fn(), fail: vi.fn()},
      now: () => fixedNow,
      secret: () => "cron-secret",
      prepare: async () => {
        throw new JobRequestError(415, "UNSUPPORTED_MEDIA_TYPE");
      },
      run: vi.fn(),
    });

    const response = await invoke(post, {authorization: "Bearer cron-secret"});

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({error: "UNSUPPORTED_MEDIA_TYPE"});
    expect(claim).not.toHaveBeenCalled();
  });
});
