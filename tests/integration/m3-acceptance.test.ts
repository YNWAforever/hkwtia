import {Pool, type PoolClient} from "pg";
import {drizzle} from "drizzle-orm/node-postgres";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const activeDatabase = vi.hoisted(() => ({current: null as unknown}));
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => activeDatabase.current};
});

import {getAutomationDashboard} from "@/lib/admin/automations";
import {getMember360} from "@/lib/admin/member-360";
import {runCampaignBatch, type CampaignRunnerDependencies} from "@/lib/automation/campaign-runner";
import {expireStaleApprovals} from "@/lib/automation/approvals-expirer";
import {recomputeEngagementScores} from "@/lib/automation/engagement-score-runner";
import {runJourneyBatch, type JourneyRunnerDependencies} from "@/lib/automation/journey-runner";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createWoztellAdapter} from "@/lib/channels/woztell";
import {createAutomationAdminRepository} from "@/lib/db/repos/automation-admin";
import {createApprovalExpiryRepository} from "@/lib/db/repos/approvals";
import {createCampaignRecipientDeliveryRepository} from "@/lib/db/repos/campaign-recipient-delivery";
import {createDeliveriesRepository} from "@/lib/db/repos/deliveries";
import {createDunningLapseRepository} from "@/lib/db/repos/dunning-lapse";
import {createEngagementScoreRepository} from "@/lib/db/repos/engagement";
import {createJobRunnerContextRepository} from "@/lib/db/repos/job-runner-context";
import {createScheduledJobsRepository} from "@/lib/db/repos/jobs";
import {
  createJourneysRepository,
  type AutomationDatabase,
} from "@/lib/db/repos/journeys";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {createTestTransport} from "@/lib/email/transport";
import {createJobPost} from "@/lib/jobs/handler";
import type {AdminActor} from "@/lib/membership/lifecycle";
import {
  M3_PROFILE_IDS,
  M3_SEED_UUIDS,
  buildM3SeedFixture,
  seedM3,
} from "@/scripts/seed-m3";
import {
  createM3AcceptanceCaseLifecycle,
  requireM3AcceptanceDatabase,
} from "@/tests/fixtures/m3-acceptance-safety";

const acceptanceDatabase = process.env.DATABASE_URL_TEST?.trim()
  ? requireM3AcceptanceDatabase(process.env)
  : null;
const testDatabaseUrl = acceptanceDatabase?.databaseUrl ?? "";
const now = new Date("2026-07-26T04:00:00.000Z");
const fixture = buildM3SeedFixture(now);
const profileIds = Object.values(M3_PROFILE_IDS);
const cronActor = automationCronActor();
const adminActor: AdminActor = {
  kind: "staff",
  userId: "m3-test-auth-staff-admin",
  profileId: M3_PROFILE_IDS.staffAdmin,
};
const testCronSecret = "m3-acceptance-token-is-not-a-live-secret";

let pool: Pool | undefined;
let database: AutomationDatabase | undefined;

function requirePool(): Pool {
  if (!pool) throw new Error("DATABASE_URL_TEST pool was not initialized");
  return pool;
}

function requireDatabase(): AutomationDatabase {
  if (!database) throw new Error("DATABASE_URL_TEST database was not initialized");
  return database;
}

function requestFor(path: string): Request {
  return new Request(`https://m3.example.test${path}`, {
    method: "POST",
    headers: {authorization: `Bearer ${testCronSecret}`},
  });
}

function hourRunKey(kind: string, instant: Date): string {
  return `${kind}:${instant.toISOString().slice(0, 13)}`;
}

function dayRunKey(kind: string, instant: Date): string {
  return `${kind}:${instant.toISOString().slice(0, 10)}`;
}

function transactionFacade(client: PoolClient): AutomationDatabase {
  const executor = drizzle(client) as unknown as AutomationDatabase;
  const facade = {
    execute: executor.execute.bind(executor),
    async transaction<T>(
      callback: (transaction: AutomationDatabase) => Promise<T>,
    ): Promise<T> {
      return callback(facade as unknown as AutomationDatabase);
    },
  };
  return facade as unknown as AutomationDatabase;
}

async function cleanM3Fixture(activePool: Pool): Promise<void> {
  const runKeys = [
    hourRunKey("journey-runner", now),
    dayRunKey("engagement-score", now),
    hourRunKey("approvals-expirer", now),
  ];
  await activePool.query(
    `DELETE FROM audit_events
     WHERE target_id = ANY($1::text[])
        OR request_id LIKE 'm3-seed:%'`,
    [[
      ...fixture.journeys.map(({id}) => id),
      ...fixture.approvals.map(({id}) => id),
    ]],
  );
  await activePool.query(
    "DELETE FROM staff_tasks WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM email_log WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM whatsapp_log WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM campaigns WHERE id = $1",
    [M3_SEED_UUIDS.campaign],
  );
  await activePool.query(
    "DELETE FROM saved_segments WHERE id = $1",
    [M3_SEED_UUIDS.segment],
  );
  await activePool.query(
    "DELETE FROM approvals WHERE id = ANY($1::uuid[])",
    [fixture.approvals.map(({id}) => id)],
  );
  await activePool.query(
    "DELETE FROM journey_state WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM message_suppressions WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM engagement_events WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM engagement_scores WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    "DELETE FROM memberships WHERE owner_user_id = ANY($1::text[])",
    [profileIds],
  );
  await activePool.query(
    `DELETE FROM jobs
     WHERE run_key = ANY($1::text[])
        OR run_key LIKE 'm3-seed:%'`,
    [runKeys],
  );
  await activePool.query(
    "DELETE FROM profiles WHERE id = ANY($1::text[])",
    [profileIds],
  );
}

const caseLifecycle = createM3AcceptanceCaseLifecycle({
  clean: async () => cleanM3Fixture(requirePool()),
  seed: async () => {
    await seedM3(requirePool(), {now});
  },
});

function journeyDependencies(
  activePool: Pool,
  activeDb: AutomationDatabase,
  emailTransport: ReturnType<typeof createTestTransport>,
): JourneyRunnerDependencies {
  const loadDatabase = async () => activeDb;
  const contexts = createJobRunnerContextRepository(loadDatabase);
  const adapterFetch = vi.fn(async () => {
    throw new Error("LIVE_WOZTELL_PROVIDER_FORBIDDEN_IN_ACCEPTANCE");
  });
  return {
    journeys: createJourneysRepository(loadDatabase),
    deliveries: createDeliveriesRepository(loadDatabase),
    staffTasks: createStaffTasksRepository(loadDatabase),
    memberships: createDunningLapseRepository(loadDatabase),
    async loadContext(actor, claim) {
      const context = await contexts.loadJourney(
        actor,
        claim.profileId,
        claim.membershipId,
      );
      const portalUrl = "https://m3.example.test/portal";
      return {
        hasLoggedIn: context.lastLoginAt !== null,
        profileCompleteness: context.profileComplete ? 100 : 0,
        marketingConsent: context.marketingConsent,
        emailSuppressed: context.emailSuppressed,
        whatsappOptIn: context.whatsappOptIn,
        whatsappNumber: context.whatsappNumber,
        engagementScore: context.engagementScore,
        email: context.email,
        recipientName: context.displayName,
        locale: context.locale,
        variables: {
          displayName: context.displayName,
          ctaUrl: portalUrl,
          profileUrl: portalUrl,
          renewalUrl: portalUrl,
          paymentUrl: portalUrl,
          renewalDate:
            context.billingPeriodEnd?.toISOString().slice(0, 10) ?? "",
          membershipStatus: context.membershipStatus ?? "",
        },
        unsubscribeUrl: "https://m3.example.test/unsubscribe/test-only",
        membershipStatus: context.membershipStatus,
      };
    },
    async renderEmail(input) {
      return {
        subject: `${input.template} acceptance`,
        html: `<p>${input.template}</p>`,
        text: input.template,
        headers: {},
      };
    },
    emailTransport,
    whatsappTransport: createWoztellAdapter(
      {
        WOZTELL_API_TOKEN: undefined,
        WOZTELL_CHANNEL_ID: undefined,
        WOZTELL_WEBHOOK_SECRET: undefined,
      },
      adapterFetch as unknown as typeof fetch,
    ),
    emailFrom: "WTIA M3 Acceptance <automation@m3.example.test>",
  };
}

function campaignDependencies(
  activeDb: AutomationDatabase,
  emailTransport: ReturnType<typeof createTestTransport>,
): CampaignRunnerDependencies {
  const loadDatabase = async () => activeDb;
  const contexts = createJobRunnerContextRepository(loadDatabase);
  return {
    campaigns: createCampaignRecipientDeliveryRepository(loadDatabase),
    deliveries: createDeliveriesRepository(loadDatabase),
    staffTasks: createStaffTasksRepository(loadDatabase),
    async loadContext(actor, profileId) {
      const context = await contexts.loadCampaign(actor, profileId);
      return {
        marketingConsent: context.marketingConsent,
        emailSuppressed: context.emailSuppressed,
        unsubscribeUrl: "https://m3.example.test/unsubscribe/test-only",
      };
    },
    async renderCampaign(input) {
      return {
        subject: `${input.template} acceptance`,
        html: `<p>${input.template}</p>`,
        text: input.template,
        headers: {},
      };
    },
    emailTransport,
    emailFrom: "WTIA M3 Acceptance <automation@m3.example.test>",
  };
}

function createHourlyAcceptancePost(
  activePool: Pool,
  activeDb: AutomationDatabase,
  emailTransport: ReturnType<typeof createTestTransport>,
) {
  const journeys = journeyDependencies(activePool, activeDb, emailTransport);
  const campaigns = campaignDependencies(activeDb, emailTransport);
  const jobs = createScheduledJobsRepository(async () => activeDb);
  return createJobPost({
    kind: "journey-runner",
    bucket: "hourly",
    jobs,
    now: () => new Date(now),
    secret: () => testCronSecret,
    async run({now: runNow}) {
      const [journey, campaign] = await Promise.all([
        runJourneyBatch(journeys, {now: runNow, limit: 50}),
        runCampaignBatch(campaigns, {now: runNow, limit: 50}),
      ]);
      return {journey, campaign};
    },
  });
}

describe.skipIf(!testDatabaseUrl)(
  "M3 acceptance on an isolated current migrated Postgres",
  () => {
    beforeAll(async () => {
      pool = new Pool({connectionString: testDatabaseUrl});
      database = drizzle(pool) as unknown as AutomationDatabase;
      activeDatabase.current = database;
    }, 120_000);

    beforeEach(async () => caseLifecycle.prepare(), 120_000);

    afterEach(async () => caseLifecycle.cleanup(), 120_000);

    afterAll(async () => {
      if (!pool) return;
      await pool.end();
      pool = undefined;
      database = undefined;
      activeDatabase.current = null;
    }, 120_000);

    it("seeds and reconciles the exact fixed fixture idempotently", async () => {
      const activePool = requirePool();
      const before = await activePool.query<{
        profiles: number;
        journeys: number;
        recipients: number;
        approvals: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM profiles
            WHERE id = ANY($1::text[])) AS profiles,
          (SELECT count(*)::int FROM journey_state
            WHERE profile_id = ANY($1::text[])) AS journeys,
          (SELECT count(*)::int FROM campaign_recipients
            WHERE campaign_id = $2) AS recipients,
          (SELECT count(*)::int FROM approvals
            WHERE id = ANY($3::uuid[])) AS approvals
      `, [
        profileIds,
        M3_SEED_UUIDS.campaign,
        fixture.approvals.map(({id}) => id),
      ]);

      await seedM3(activePool, {now});
      const after = await activePool.query<{
        profiles: number;
        journeys: number;
        recipients: number;
        approvals: number;
      }>(`
        SELECT
          (SELECT count(*)::int FROM profiles
            WHERE id = ANY($1::text[])) AS profiles,
          (SELECT count(*)::int FROM journey_state
            WHERE profile_id = ANY($1::text[])) AS journeys,
          (SELECT count(*)::int FROM campaign_recipients
            WHERE campaign_id = $2) AS recipients,
          (SELECT count(*)::int FROM approvals
            WHERE id = ANY($3::uuid[])) AS approvals
      `, [
        profileIds,
        M3_SEED_UUIDS.campaign,
        fixture.approvals.map(({id}) => id),
      ]);

      expect(before.rows).toEqual(after.rows);
      expect(after.rows).toEqual([{
        profiles: fixture.profiles.length,
        journeys: fixture.journeys.length,
        recipients: fixture.campaignRecipients.length,
        approvals: fixture.approvals.length,
      }]);
    });

    it(
      "runs the duplicate hourly job exactly once across both Day-7 branches, suppression, WhatsApp, and frozen campaigns",
      async () => {
        const activePool = requirePool();
        const activeDb = requireDatabase();
        const emailTransport = createTestTransport();
        const post = createHourlyAcceptancePost(
          activePool,
          activeDb,
          emailTransport,
        );

        const first = await post(requestFor("/api/jobs/journey-runner"));
        const sendsAfterFirst = emailTransport.sends.length;
        const second = await post(requestFor("/api/jobs/journey-runner"));

        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({duplicate: false});
        expect(second.status).toBe(200);
        expect(await second.json()).toEqual({duplicate: true});
        expect(emailTransport.sends).toHaveLength(sendsAfterFirst);

        const sentEmails = await activePool.query<{
          profile_id: string;
          template: string;
          classification: string;
          count: number;
        }>(`
          SELECT profile_id, template, classification, count(*)::int AS count
          FROM email_log
          WHERE profile_id = ANY($1::text[]) AND status = 'sent'
          GROUP BY profile_id, template, classification
          ORDER BY profile_id, template
        `, [profileIds]);
        expect(sentEmails.rows).toEqual([
          {
            profile_id: M3_PROFILE_IDS.campaignEligible,
            template: "campaign_generic",
            classification: "marketing",
            count: 1,
          },
          {
            profile_id: M3_PROFILE_IDS.day7LoggedIn,
            template: "day7_mixer",
            classification: "marketing",
            count: 1,
          },
          {
            profile_id: M3_PROFILE_IDS.day7NoLogin,
            template: "day7_nudge",
            classification: "transactional",
            count: 1,
          },
          {
            profile_id: M3_PROFILE_IDS.marketingUnsubscribed,
            template: "renewal_14",
            classification: "transactional",
            count: 1,
          },
          {
            profile_id: M3_PROFILE_IDS.renewalWhatsappOptedIn,
            template: "renewal_14",
            classification: "transactional",
            count: 1,
          },
          {
            profile_id: M3_PROFILE_IDS.renewalWhatsappOptedOut,
            template: "renewal_14",
            classification: "transactional",
            count: 1,
          },
        ].sort((left, right) => (
          left.profile_id.localeCompare(right.profile_id)
          || left.template.localeCompare(right.template)
        )));

        const branches = await activePool.query<{
          profile_id: string;
          step: string;
          status: string;
        }>(`
          SELECT profile_id, step, status
          FROM journey_state
          WHERE profile_id = ANY($1::text[])
            AND step IN ('day7_nudge', 'day7_mixer')
          ORDER BY profile_id, step
        `, [[
          M3_PROFILE_IDS.day7NoLogin,
          M3_PROFILE_IDS.day7LoggedIn,
        ]]);
        expect(branches.rows).toEqual([
          {
            profile_id: M3_PROFILE_IDS.day7LoggedIn,
            step: "day7_mixer",
            status: "sent",
          },
          {
            profile_id: M3_PROFILE_IDS.day7LoggedIn,
            step: "day7_nudge",
            status: "skipped",
          },
          {
            profile_id: M3_PROFILE_IDS.day7NoLogin,
            step: "day7_mixer",
            status: "skipped",
          },
          {
            profile_id: M3_PROFILE_IDS.day7NoLogin,
            step: "day7_nudge",
            status: "sent",
          },
        ]);

        const whatsapp = await activePool.query<{
          profile_id: string;
          template: string;
          status: string;
          count: number;
        }>(`
          SELECT profile_id, template, status, count(*)::int AS count
          FROM whatsapp_log
          WHERE profile_id = ANY($1::text[])
          GROUP BY profile_id, template, status
          ORDER BY profile_id
        `, [[
          M3_PROFILE_IDS.renewalWhatsappOptedIn,
          M3_PROFILE_IDS.renewalWhatsappOptedOut,
        ]]);
        expect(whatsapp.rows).toEqual([{
          profile_id: M3_PROFILE_IDS.renewalWhatsappOptedIn,
          template: "renewal_14",
          status: "sent",
          count: 1,
        }]);

        const campaignState = await activePool.query<{
          profile_id: string;
          status: string;
          attempt_count: number;
        }>(`
          SELECT profile_id, status, attempt_count
          FROM campaign_recipients
          WHERE campaign_id = $1
          ORDER BY profile_id
        `, [M3_SEED_UUIDS.campaign]);
        expect(campaignState.rows).toEqual([
          {
            profile_id: M3_PROFILE_IDS.campaignEligible,
            status: "sent",
            attempt_count: 1,
          },
          {
            profile_id: M3_PROFILE_IDS.marketingUnsubscribed,
            status: "suppressed",
            attempt_count: 1,
          },
        ]);

        const jobRows = await activePool.query<{
          run_key: string;
          state: string;
          count: number;
        }>(`
          SELECT min(run_key) AS run_key, min(state) AS state,
                 count(*)::int AS count
          FROM jobs
          WHERE run_key = $1
        `, [hourRunKey("journey-runner", now)]);
        expect(jobRows.rows).toEqual([{
          run_key: hourRunKey("journey-runner", now),
          state: "completed",
          count: 1,
        }]);
      },
      60_000,
    );

    it(
      "runs production scoring, approval, and job boundaries inside a rolled-back isolated transaction",
      async () => {
        const activePool = requirePool();
        const client = await activePool.connect();
        try {
          await client.query("BEGIN");
          const transactionalDb = transactionFacade(client);
          const jobs = createScheduledJobsRepository(
            async () => transactionalDb,
          );
          const engagement = createEngagementScoreRepository(
            async () => transactionalDb,
          );
          const approvals = createApprovalExpiryRepository(
            async () => transactionalDb,
          );
          const engagementPost = createJobPost({
            kind: "engagement-score",
            bucket: "daily",
            jobs,
            now: () => new Date(now),
            secret: () => testCronSecret,
            async run({now: runNow}) {
              return recomputeEngagementScores(
                cronActor,
                runNow,
                {engagement, batchSize: 100},
              );
            },
          });
          const approvalsPost = createJobPost({
            kind: "approvals-expirer",
            bucket: "hourly",
            jobs,
            now: () => new Date(now),
            secret: () => testCronSecret,
            async run({now: runNow}) {
              return expireStaleApprovals(
                cronActor,
                runNow,
                {approvals, batchSize: 100},
              );
            },
          });

          const scoreFirst = await engagementPost(
            requestFor("/api/jobs/engagement-score"),
          );
          const scoreDuplicate = await engagementPost(
            requestFor("/api/jobs/engagement-score"),
          );
          const approvalFirst = await approvalsPost(
            requestFor("/api/jobs/approvals-expirer"),
          );
          const approvalDuplicate = await approvalsPost(
            requestFor("/api/jobs/approvals-expirer"),
          );
          expect(await scoreFirst.json()).toMatchObject({duplicate: false});
          expect(await scoreDuplicate.json()).toEqual({duplicate: true});
          expect(await approvalFirst.json()).toMatchObject({duplicate: false});
          expect(await approvalDuplicate.json()).toEqual({duplicate: true});

          const score = await client.query<{
            score: string;
            computed_at: Date;
          }>(
            `SELECT score, computed_at
             FROM engagement_scores
             WHERE profile_id = $1`,
            [M3_PROFILE_IDS.engagementMember],
          );
          expect(Number(score.rows[0]?.score)).toBeGreaterThan(0);
          expect(score.rows[0]?.computed_at).toEqual(now);

          const approval = await client.query<{
            status: string;
            decided_at: Date | null;
            audit_count: number;
            task_count: number;
          }>(`
            SELECT approval.status, approval.decided_at,
              (SELECT count(*)::int FROM audit_events
               WHERE action = 'approval.expired'
                 AND target_id = approval.id::text) AS audit_count,
              (SELECT count(*)::int FROM staff_tasks
               WHERE dedupe_key = 'approval-expiry:' || approval.id::text)
                 AS task_count
            FROM approvals AS approval
            WHERE approval.id = $1
          `, [fixture.approvals[0]!.id]);
          expect(approval.rows).toEqual([{
            status: "expired",
            decided_at: now,
            audit_count: 1,
            task_count: 1,
          }]);
        } finally {
          await client.query("ROLLBACK");
          client.release();
        }
      },
      60_000,
    );

    it("shows seeded automation data through production admin and Member 360 readers", async () => {
      const activePool = requirePool();
      const activeDb = requireDatabase();
      const emailTransport = createTestTransport();
      const post = createHourlyAcceptancePost(
        activePool,
        activeDb,
        emailTransport,
      );
      const runnerResponse = await post(requestFor("/api/jobs/journey-runner"));
      expect(runnerResponse.status).toBe(200);
      expect(await runnerResponse.json()).toMatchObject({duplicate: false});

      const dashboard = await getAutomationDashboard(
        adminActor,
        {limit: "50"},
        createAutomationAdminRepository(async () => activeDb),
        now,
      );
      expect(dashboard.counts.failed).toBeGreaterThanOrEqual(1);
      expect(dashboard.jobs).toEqual(expect.arrayContaining([
        expect.objectContaining({
          kind: "journey-runner",
          state: "completed",
        }),
        expect.objectContaining({
          kind: "worker-alert",
          state: "failed",
          errorCode: "WORKER_ALERT_DELIVERY_FAILED",
        }),
      ]));
      expect(dashboard.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: fixture.journeys.find(({status}) => status === "failed")!.id,
          status: "failed",
          retryable: true,
        }),
      ]));

      const unsubscribed = await getMember360(
        adminActor,
        M3_PROFILE_IDS.marketingUnsubscribed,
      );
      expect(unsubscribed.journeys).toEqual(expect.arrayContaining([
        expect.objectContaining({step: "renewal_14", status: "sent"}),
      ]));
      expect(unsubscribed.emails).toEqual(expect.arrayContaining([
        expect.objectContaining({
          template: "renewal_14",
          status: "sent",
        }),
      ]));
      expect(unsubscribed.suppressions).toEqual(expect.arrayContaining([
        expect.objectContaining({
          channel: "email",
          classification: "marketing",
        }),
      ]));

      const optedIn = await getMember360(
        adminActor,
        M3_PROFILE_IDS.renewalWhatsappOptedIn,
      );
      expect(optedIn.whatsapp).toEqual([
        expect.objectContaining({
          template: "renewal_14",
          status: "sent",
          classification: "transactional",
        }),
      ]);
    });

    it("claims one newly due row once across concurrent production repository transactions", async () => {
      const activePool = requirePool();
      const activeDb = requireDatabase();
      const claimNow = new Date(now.getTime() + 86_400_000);
      await activePool.query(`
        UPDATE journey_state
        SET status = 'skipped',
            completed_at = $2,
            updated_at = $2,
            error_code = 'm3_acceptance_case_isolation'
        WHERE profile_id = ANY($1::text[])
          AND status = 'scheduled'
      `, [profileIds, now]);
      const uniqueEarliestScheduledAt = new Date(
        "2000-01-01T00:00:00.000Z",
      );
      const deliveryKey =
        `journey:${M3_PROFILE_IDS.memberAccess}:onboarding_90d:`
        + "m3-seed:concurrent:welcome";
      await activePool.query(`
        INSERT INTO journey_state
          (id, profile_id, journey, instance_key, step, scheduled_at,
           status, attempt_count, claimed_at, claim_expires_at,
           delivery_key, error_code, completed_at, created_at, updated_at)
        VALUES ($1, $2, 'onboarding_90d', 'm3-seed:concurrent', 'welcome',
          $3, 'scheduled', 0, NULL, NULL, $4, NULL, NULL, $5, $5)
        ON CONFLICT (id) DO UPDATE SET
          status = 'scheduled', attempt_count = 0, claimed_at = NULL,
          claim_expires_at = NULL, error_code = NULL, completed_at = NULL,
          scheduled_at = EXCLUDED.scheduled_at, updated_at = EXCLUDED.updated_at
      `, [
        M3_SEED_UUIDS.concurrentJourney,
        M3_PROFILE_IDS.memberAccess,
        uniqueEarliestScheduledAt,
        deliveryKey,
        now,
      ]);
      const journeys = createJourneysRepository(async () => activeDb);

      const [left, right] = await Promise.all([
        journeys.claimDue(cronActor, claimNow, 1, 300_000),
        journeys.claimDue(cronActor, claimNow, 1, 300_000),
      ]);
      const claims = [...left, ...right].filter(
        ({id}) => id === M3_SEED_UUIDS.concurrentJourney,
      );
      expect(claims).toHaveLength(1);
      expect(claims[0]).toMatchObject({
        id: M3_SEED_UUIDS.concurrentJourney,
        attemptCount: 1,
        status: "processing",
        claimedAt: claimNow,
      });
    });
  },
);
