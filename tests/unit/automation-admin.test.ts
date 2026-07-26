import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {
  getAutomationDashboard,
  runRetryAutomationAction,
  type AutomationDashboard,
  type AutomationDashboardReader,
  type AutomationRetryWriter,
} from "@/lib/admin/automations";
import {
  createAutomationAdminRepository,
  type AutomationAdminExecutor,
} from "@/lib/db/repos/automation-admin";
import {
  createJourneysRepository,
  type AutomationDatabase,
  type AutomationSqlExecutor,
} from "@/lib/db/repos/journeys";
import type {Actor, AdminActor} from "@/lib/membership/lifecycle";

const dialect = new PgDialect();
const asOf = new Date("2027-01-15T10:00:00.000Z");
const staff: AdminActor = {
  kind: "staff",
  userId: "auth-staff",
  profileId: "staff-1",
};
const member: Extract<Actor, {kind: "member"}> = {
  kind: "member",
  userId: "auth-member",
  profileId: "member-1",
};
const journeyId = "11111111-1111-4111-8111-111111111111";
const automationJobId = "44444444-4444-4444-8444-444444444444";
const unknownJobId = "55555555-5555-4555-8555-555555555555";

const dashboardFixture = (): AutomationDashboard => ({
  asOf: asOf.toISOString(),
  counts: {due: 2, upcoming: 1, failed: 1, processing: 1},
  jobs: [{
    id: automationJobId,
    kind: "journey-runner",
    state: "failed",
    updatedAt: "2027-01-15T09:59:00.000Z",
    errorCode: "JOB_RUN_FAILED",
  }],
  rows: [{
    id: journeyId,
    journey: "renewal",
    step: "renewal_14",
    status: "failed",
    scheduledAt: "2027-01-15T09:00:00.000Z",
    attemptCount: 3,
    errorCode: "provider_client_error",
    retryable: true,
  }],
  nextCursor: null,
});

function sequenceExecutor(responses: Record<string, unknown>[][]) {
  const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
  const executor: AutomationAdminExecutor = {
    async execute(query) {
      commands.push(dialect.sqlToQuery(query));
      return {rows: responses.shift() ?? []};
    },
  };
  return {commands, executor};
}

function journeyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: journeyId,
    profile_id: "member-1",
    membership_id: null,
    journey: "renewal",
    instance_key: "period:2027-02-01",
    step: "renewal_14",
    scheduled_at: asOf,
    status: "failed",
    attempt_count: 3,
    claimed_at: null,
    claim_expires_at: null,
    delivery_key: "journey:member-1:renewal:period:2027-02-01:renewal_14",
    error_code: "provider_client_error",
    completed_at: asOf,
    created_at: asOf,
    updated_at: asOf,
    ...overrides,
  };
}

describe("automation admin service authorization and input bounds", () => {
  it.each([
    {kind: "staff", userId: "staff-auth", profileId: "staff-profile"},
    {kind: "exco", userId: "exco-auth", profileId: "exco-profile"},
    {kind: "superadmin", userId: "super-auth", profileId: "super-profile"},
  ] as const)("returns an explicit as-of snapshot for $kind", async (actor) => {
    const reader: AutomationDashboardReader = {
      getDashboard: vi.fn(async () => dashboardFixture()),
    };

    const result = await getAutomationDashboard(
      actor,
      {limit: "25"},
      reader,
      asOf,
    );

    expect(result).toEqual(dashboardFixture());
    expect(reader.getDashboard).toHaveBeenCalledWith(actor, {
      asOf,
      cursor: null,
      limit: 25,
    });
  });

  it("denies a member before loading operational data", async () => {
    const reader: AutomationDashboardReader = {
      getDashboard: vi.fn(async () => dashboardFixture()),
    };

    await expect(getAutomationDashboard(member, {}, reader, asOf))
      .rejects.toMatchObject({code: "FORBIDDEN"});
    expect(reader.getDashboard).not.toHaveBeenCalled();
  });

  it.each([
    {limit: "0"},
    {limit: "51"},
    {limit: "2.5"},
    {cursor: "x".repeat(513)},
  ])("rejects an unbounded dashboard query before repository access", async (query) => {
    const reader: AutomationDashboardReader = {
      getDashboard: vi.fn(async () => dashboardFixture()),
    };

    await expect(getAutomationDashboard(staff, query, reader, asOf))
      .rejects.toThrow();
    expect(reader.getDashboard).not.toHaveBeenCalled();
  });
});

describe("automation admin repository projection", () => {
  it("returns exact counts, bounded sanitized jobs, and a stable paged DTO without PII", async () => {
    const firstScheduledAt = new Date("2027-01-15T09:00:00.000Z");
    const secondScheduledAt = new Date("2027-01-15T08:00:00.000Z");
    const fixture = sequenceExecutor([
      [{due: "2", upcoming: "1", failed: "1", processing: "1"}],
      [
        {
          id: automationJobId,
          kind: "journey-runner",
          state: "failed",
          updated_at: new Date("2027-01-15T09:59:00.000Z"),
          error_code: "JOB_RUN_FAILED",
          email: "member@example.test",
          phone: "+85260000000",
          provider_id: "provider-secret",
          message_body: "private body",
          token: "secret-token",
        },
        {
          id: unknownJobId,
          kind: "worker@example.test",
          state: "unknown-state",
          updated_at: new Date("2027-01-15T09:58:00.000Z"),
          error_code: "+85260000000",
        },
      ],
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          journey: "renewal",
          step: "renewal_14",
          status: "failed",
          scheduled_at: firstScheduledAt,
          attempt_count: 3,
          error_code: "provider_client_error",
          profile_email: "member@example.test",
          recipient_phone: "+85260000000",
          provider_id: "provider-secret",
          body: "private body",
          token: "secret-token",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          journey: "onboarding_90d",
          step: "day30_recap",
          status: "scheduled",
          scheduled_at: secondScheduledAt,
          attempt_count: 0,
          error_code: null,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          journey: "onboarding_90d",
          step: "welcome",
          status: "sent",
          scheduled_at: new Date("2027-01-15T07:00:00.000Z"),
          attempt_count: 1,
          error_code: null,
        },
      ],
    ]);
    const repository = createAutomationAdminRepository(async () => fixture.executor);

    const dashboard = await repository.getDashboard(staff, {
      asOf,
      cursor: null,
      limit: 2,
    });

    expect(dashboard).toEqual({
      asOf: asOf.toISOString(),
      counts: {due: 2, upcoming: 1, failed: 1, processing: 1},
      jobs: [
        {
          id: automationJobId,
          kind: "journey-runner",
          state: "failed",
          updatedAt: "2027-01-15T09:59:00.000Z",
          errorCode: "JOB_RUN_FAILED",
        },
        {
          id: unknownJobId,
          kind: "unknown",
          state: "unknown",
          updatedAt: "2027-01-15T09:58:00.000Z",
          errorCode: null,
        },
      ],
      rows: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          journey: "renewal",
          step: "renewal_14",
          status: "failed",
          scheduledAt: firstScheduledAt.toISOString(),
          attemptCount: 3,
          errorCode: "provider_client_error",
          retryable: true,
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          journey: "onboarding_90d",
          step: "day30_recap",
          status: "scheduled",
          scheduledAt: secondScheduledAt.toISOString(),
          attemptCount: 0,
          errorCode: null,
          retryable: false,
        },
      ],
      nextCursor: expect.any(String),
    });
    expect(Object.keys(dashboard)).toEqual([
      "asOf",
      "counts",
      "jobs",
      "rows",
      "nextCursor",
    ]);
    expect(Object.keys(dashboard.jobs[0]!)).toEqual([
      "id",
      "kind",
      "state",
      "updatedAt",
      "errorCode",
    ]);
    expect(Object.keys(dashboard.rows[0]!)).toEqual([
      "id",
      "journey",
      "step",
      "status",
      "scheduledAt",
      "attemptCount",
      "errorCode",
      "retryable",
    ]);

    const serialized = JSON.stringify(dashboard);
    for (const secret of [
      "member@example.test",
      "+85260000000",
      "provider-secret",
      "private body",
      "secret-token",
    ]) {
      expect(serialized).not.toContain(secret);
    }

    expect(fixture.commands).toHaveLength(3);
    const countSql = fixture.commands[0]!.sql.replace(/\s+/g, " ");
    const jobsSql = fixture.commands[1]!.sql.replace(/\s+/g, " ");
    const rowsSql = fixture.commands[2]!.sql.replace(/\s+/g, " ");
    expect(countSql).toMatch(/count\(\*\).*status.*scheduled.*scheduled_at.*<=/i);
    expect(countSql).toMatch(/count\(\*\).*status.*scheduled.*scheduled_at.*>/i);
    expect(countSql).toMatch(/count\(\*\).*status.*failed/i);
    expect(countSql).toMatch(/count\(\*\).*status.*processing/i);
    expect(fixture.commands[0]!.params.filter((value) => value instanceof Date))
      .toEqual([asOf, asOf]);
    expect(jobsSql).toMatch(/ORDER BY .*updated_at.*DESC.*id.*DESC.*LIMIT/i);
    expect(fixture.commands[1]!.params).toContain(10);
    expect(rowsSql).toMatch(/ORDER BY .*scheduled_at.*DESC.*id.*DESC.*LIMIT/i);
    expect(fixture.commands[2]!.params).toContain(3);
  });

  it("applies the opaque cursor as a scheduled-at and id continuation fence", async () => {
    const first = sequenceExecutor([
      [{due: 0, upcoming: 0, failed: 0, processing: 0}],
      [],
      [
        {
          id: "11111111-1111-4111-8111-111111111111",
          journey: "renewal",
          step: "renewal_14",
          status: "failed",
          scheduled_at: new Date("2027-01-15T09:00:00.000Z"),
          attempt_count: 3,
          error_code: "provider_client_error",
        },
        {
          id: "22222222-2222-4222-8222-222222222222",
          journey: "renewal",
          step: "renewal_30",
          status: "scheduled",
          scheduled_at: new Date("2027-01-15T08:00:00.000Z"),
          attempt_count: 0,
          error_code: null,
        },
      ],
    ]);
    const firstPage = await createAutomationAdminRepository(async () => first.executor)
      .getDashboard(staff, {asOf, cursor: null, limit: 1});
    expect(firstPage.nextCursor).toEqual(expect.any(String));

    const second = sequenceExecutor([
      [{due: 0, upcoming: 0, failed: 0, processing: 0}],
      [],
      [],
    ]);
    await createAutomationAdminRepository(async () => second.executor)
      .getDashboard(staff, {
        asOf,
        cursor: firstPage.nextCursor,
        limit: 1,
      });

    const rowsSql = second.commands[2]!.sql.replace(/\s+/g, " ");
    expect(rowsSql).toMatch(/scheduled_at.*<.*OR.*scheduled_at.*=.*AND.*id.*</i);
    expect(second.commands[2]!.params).toContain(
      "11111111-1111-4111-8111-111111111111",
    );
    expect(second.commands[2]!.params).toContainEqual(
      new Date("2027-01-15T09:00:00.000Z"),
    );
  });

  it("requires an admin actor before opening the database or retry writer", async () => {
    const loadExecutor = vi.fn(async () => sequenceExecutor([]).executor);
    const retryFailedJourney = vi.fn();
    const repository = createAutomationAdminRepository(loadExecutor, {
      retryFailedJourney,
    });

    await expect(repository.getDashboard(member, {
      asOf,
      cursor: null,
      limit: 25,
    })).rejects.toMatchObject({code: "FORBIDDEN"});
    await expect(repository.retryFailed(member, journeyId, asOf))
      .rejects.toMatchObject({code: "FORBIDDEN"});
    expect(loadExecutor).not.toHaveBeenCalled();
    expect(retryFailedJourney).not.toHaveBeenCalled();
  });
});

describe("audited failed-only retry", () => {
  it("delegates only to the audited journey transition and exposes no send dependency", async () => {
    const retryFailedJourney = vi.fn(async () => journeyRow({
      status: "scheduled",
      error_code: null,
    }));
    const writer = createAutomationAdminRepository(
      async () => sequenceExecutor([]).executor,
      {retryFailedJourney},
    );

    await expect(writer.retryFailed(staff, journeyId, asOf))
      .resolves.toMatchObject({status: "scheduled", errorCode: null});
    expect(retryFailedJourney).toHaveBeenCalledWith(staff, journeyId, asOf);
    expect(writer).not.toHaveProperty("send");
  });

  it("allows one concurrent failed retry, fences the stale retry, and appends one audit", async () => {
    let status = "failed";
    let auditWrites = 0;
    const commands: ReturnType<PgDialect["sqlToQuery"]>[] = [];
    const execute: AutomationSqlExecutor["execute"] = async (query) => {
      const command = dialect.sqlToQuery(query);
      commands.push(command);
      const normalized = command.sql.replace(/\s+/g, " ");
      if (/UPDATE "journey_state".*status = 'scheduled'/i.test(normalized)) {
        if (status !== "failed") return {rows: []};
        status = "scheduled";
        return {rows: [journeyRow({status, error_code: null})]};
      }
      if (/UPDATE "(email_log|whatsapp_log)"/i.test(normalized)) return {rows: []};
      if (/INSERT INTO "audit_events"/i.test(normalized)) {
        auditWrites += 1;
        return {rows: []};
      }
      throw new Error(`UNEXPECTED_SQL:${normalized}`);
    };
    const database: AutomationDatabase = {
      execute,
      transaction: async (work) => work({execute}),
    };
    const repository = createJourneysRepository(async () => database);

    const results = await Promise.allSettled([
      repository.retryFailed(staff, journeyId, asOf),
      repository.retryFailed(staff, journeyId, asOf),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(auditWrites).toBe(1);
    expect(commands.filter((command) =>
      /INSERT INTO "audit_events"/i.test(command.sql))).toHaveLength(1);
  });

  it("validates bounded form data and returns only safe action state", async () => {
    const retry: AutomationRetryWriter["retryFailed"] = vi.fn(async () => ({
      id: journeyId,
      status: "scheduled",
      errorCode: null,
    }));
    const valid = new FormData();
    valid.set("journeyId", journeyId);
    valid.set("locale", "en");

    await expect(runRetryAutomationAction({}, valid, {
      actor: staff,
      now: () => asOf,
      retry,
    })).resolves.toEqual({status: "success", code: "scheduled"});
    expect(retry).toHaveBeenCalledWith(staff, journeyId, asOf);

    const invalid = new FormData();
    invalid.set("journeyId", "x".repeat(1_000));
    invalid.set("locale", "en");
    await expect(runRetryAutomationAction({}, invalid, {
      actor: staff,
      now: () => asOf,
      retry,
    })).resolves.toEqual({status: "error", code: "validation"});

    const privateFailure = vi.fn(async () => {
      throw new Error("member@example.test provider-secret");
    });
    const state = await runRetryAutomationAction({}, valid, {
      actor: staff,
      now: () => asOf,
      retry: privateFailure,
    });
    expect(state).toEqual({status: "error", code: "error"});
    expect(JSON.stringify(state)).not.toContain("member@example.test");
    expect(JSON.stringify(state)).not.toContain("provider-secret");
  });
});
