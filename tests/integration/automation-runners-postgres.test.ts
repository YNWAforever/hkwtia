import {Pool} from "@neondatabase/serverless";
import {sql} from "drizzle-orm";
import {drizzle} from "drizzle-orm/neon-serverless";
import {afterAll, beforeAll, describe, expect, it, vi} from "vitest";

import {
  campaignDeliveryKey,
  runCampaignBatch,
  type CampaignRenderInput,
  type CampaignRunnerDependencies,
} from "@/lib/automation/campaign-runner";
import {
  runJourneyBatch,
  type JourneyRunnerDependencies,
} from "@/lib/automation/journey-runner";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {createCampaignRecipientDeliveryRepository} from "@/lib/db/repos/campaign-recipient-delivery";
import {createDeliveriesRepository} from "@/lib/db/repos/deliveries";
import {
  createJourneysRepository,
  type AutomationDatabase,
} from "@/lib/db/repos/journeys";
import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";
import {staffTasks} from "@/lib/db/server-schema";

const testDatabaseUrl = process.env.DATABASE_URL_TEST?.trim() ?? "";
const fixture = `m3-runner-${process.pid}-${Date.now()}`;
const profileId = `${fixture}-profile`;
const segmentId = crypto.randomUUID();
const campaignId = crypto.randomUUID();
const campaignRecipientId = crypto.randomUUID();
const fencedCampaignId = crypto.randomUUID();
const fencedRecipientId = crypto.randomUUID();
const adminRetryJourneyId = crypto.randomUUID();
const cronActor = automationCronActor();
const adminActor = {
  kind: "staff",
  userId: `auth-${fixture}`,
  profileId,
} as const;
const journeyNow = new Date("2000-01-01T00:00:00.000Z");
const campaignNow = new Date("2000-01-02T00:00:00.000Z");
const adminRetryNow = new Date("2000-01-04T00:00:00.000Z");
const journeyDeliveryKey =
  `journey:${profileId}:onboarding_90d:activation:${fixture}:welcome`;
const adminRetryDeliveryKey =
  `journey:${profileId}:onboarding_90d:admin-retry:${fixture}:welcome`;
const campaignKey = campaignDeliveryKey({
  campaignId,
  id: campaignRecipientId,
});

let pool: Pool | undefined;
let database: AutomationDatabase | undefined;

function requirePool(): Pool {
  if (!pool) throw new Error("DATABASE_URL_TEST pool was not initialized");
  return pool;
}

function requireDatabase(): AutomationDatabase {
  if (!database) {
    throw new Error("DATABASE_URL_TEST database was not initialized");
  }
  return database;
}

function total(
  summaries: readonly Readonly<{claimed: number; sent: number}>[],
  key: "claimed" | "sent",
): number {
  return summaries.reduce((sum, summary) => sum + summary[key], 0);
}

describe.skipIf(!testDatabaseUrl)(
  "automation runners on current migrated Postgres",
  () => {
    beforeAll(async () => {
      pool = new Pool({connectionString: testDatabaseUrl});
      database = drizzle(pool) as unknown as AutomationDatabase;

      const currentColumns = await pool.query<{column_name: string}>(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'campaign_recipients'`,
      );
      expect(currentColumns.rows.map(({column_name}) => column_name))
        .toEqual(expect.arrayContaining([
          "attempt_count",
          "claimed_at",
          "claim_expires_at",
          "error_code",
        ]));

      await pool.query(
        `INSERT INTO profiles
           (id, auth_user_id, email, consent_marketing, display_name, locale,
            whatsapp_opt_in)
         VALUES ($1, $2, $3, true, 'M3 runner fixture', 'en', false)`,
        [
          profileId,
          `auth-${fixture}`,
          `${fixture}@example.test`,
        ],
      );
      await pool.query(
        `INSERT INTO saved_segments
           (id, owner_profile_id, name_en, filter_version, filters)
         VALUES ($1, $2, 'M3 runner segment', 1, $3::jsonb)`,
        [segmentId, profileId, JSON.stringify({profileIds: [profileId]})],
      );
    });

    afterAll(async () => {
      if (!pool) return;
      try {
        await pool.query(
          "DELETE FROM email_log WHERE idempotency_key LIKE $1",
          [`%${fixture}%`],
        );
        await pool.query(
          "DELETE FROM campaigns WHERE id = ANY($1::uuid[])",
          [[campaignId, fencedCampaignId]],
        );
        await pool.query("DELETE FROM saved_segments WHERE id = $1", [
          segmentId,
        ]);
        await pool.query(
          "DELETE FROM audit_events WHERE target_type = 'journey_state' AND target_id = $1",
          [adminRetryJourneyId],
        );
        await pool.query("DELETE FROM profiles WHERE id = $1", [profileId]);
      } finally {
        await pool.end();
      }
    });

    it(
      "runs concurrent journey workers through real repositories with one claim, provider call, and log",
      async () => {
        const activeDatabase = requireDatabase();
        const activePool = requirePool();
        const loadDatabase = async () => activeDatabase;
        const journeys = createJourneysRepository(loadDatabase);
        const deliveries = createDeliveriesRepository(loadDatabase);
        const staffTaskRepo = createStaffTasksRepository(loadDatabase);
        const providerSend = vi.fn(async () => ({
          status: "sent" as const,
          providerId: `provider-${fixture}-journey`,
        }));
        const dependencies = {
          journeys,
          deliveries,
          staffTasks: staffTaskRepo,
          memberships: {
            async lapseDunningEpisode() {
              return {
                disposition: "resolved" as const,
                createdTasks: 0,
                createdSteps: 0,
              };
            },
          },
          async loadContext() {
            const profile = await activePool.query<{
              email: string;
              consent_marketing: boolean;
            }>(
              `SELECT email, consent_marketing
               FROM profiles
               WHERE id = $1`,
              [profileId],
            );
            const row = profile.rows[0];
            if (!row) throw new Error("MISSING_RUNNER_PROFILE");
            return {
              hasLoggedIn: false,
              profileCompleteness: 100,
              marketingConsent: row.consent_marketing,
              emailSuppressed: false,
              whatsappOptIn: false,
              whatsappNumber: null,
              engagementScore: 50,
              email: row.email,
              recipientName: "M3 runner fixture",
              locale: "en" as const,
              variables: {
                ctaUrl: "https://example.test/member",
                memberName: "M3 runner fixture",
                renewalDate: "2000-02-01",
                renewalUrl: "https://example.test/renew",
                amountDue: "HKD 100",
                paymentUrl: "https://example.test/pay",
              },
              unsubscribeUrl: "https://example.test/unsubscribe",
              membershipStatus: null,
            };
          },
          async renderEmail(input) {
            return {
              subject: `${input.template}-subject`,
              html: `<p>${input.template}</p>`,
              text: input.template,
              headers: {},
            };
          },
          emailTransport: {send: providerSend},
          whatsappTransport: {
            async sendTemplateMessage() {
              return {
                status: "skipped" as const,
                reason: "recipient_ineligible" as const,
              };
            },
          },
          emailFrom: "WTIA <members@example.test>",
        } satisfies JourneyRunnerDependencies;

        const enrollment = {
          profileId,
          membershipId: null,
          journey: "onboarding_90d",
          instanceKey: `activation:${fixture}`,
          step: "welcome",
          scheduledAt: new Date(journeyNow.getTime() - 1_000),
          deliveryKey: journeyDeliveryKey,
        } as const;
        await expect(journeys.enroll(cronActor, enrollment))
          .resolves.toBe("created");
        await expect(journeys.enroll(cronActor, enrollment))
          .resolves.toBe("existing");

        const summaries = await Promise.all([
          runJourneyBatch(dependencies, {now: journeyNow, limit: 1}),
          runJourneyBatch(dependencies, {now: journeyNow, limit: 1}),
        ]);

        expect(total(summaries, "claimed")).toBe(1);
        expect(total(summaries, "sent")).toBe(1);
        expect(providerSend).toHaveBeenCalledTimes(1);
        const log = await activePool.query<{
          status: string;
          template: string;
          attempt_count: number;
          count: number;
        }>(
          `SELECT min(status) AS status, min(template) AS template,
                  min(attempt_count)::int AS attempt_count,
                  count(*)::int AS count
           FROM email_log
           WHERE idempotency_key = $1`,
          [journeyDeliveryKey],
        );
        expect(log.rows).toEqual([{
          status: "sent",
          template: "welcome",
          attempt_count: 1,
          count: 1,
        }]);
        const journey = await activePool.query<{
          status: string;
          attempt_count: number;
        }>(
          `SELECT status, attempt_count
           FROM journey_state
           WHERE delivery_key = $1`,
          [journeyDeliveryKey],
        );
        expect(journey.rows).toEqual([{
          status: "sent",
          attempt_count: 1,
        }]);
      },
    );

    it(
      "keeps failed delivery replay blocked until audited admin retry authorizes one real provider call",
      async () => {
        const activeDatabase = requireDatabase();
        const activePool = requirePool();
        const loadDatabase = async () => activeDatabase;
        const journeys = createJourneysRepository(loadDatabase);
        const deliveries = createDeliveriesRepository(loadDatabase);
        const staffTaskRepo = createStaffTasksRepository(loadDatabase);
        const providerSend = vi.fn(async () => ({
          status: "sent" as const,
          providerId: `provider-${fixture}-admin-retry`,
        }));
        const dependencies = {
          journeys,
          deliveries,
          staffTasks: staffTaskRepo,
          memberships: {
            async lapseDunningEpisode() {
              return {
                disposition: "resolved" as const,
                createdTasks: 0,
                createdSteps: 0,
              };
            },
          },
          async loadContext() {
            return {
              hasLoggedIn: false,
              profileCompleteness: 100,
              marketingConsent: true,
              emailSuppressed: false,
              whatsappOptIn: false,
              whatsappNumber: null,
              engagementScore: 50,
              email: `${fixture}@example.test`,
              recipientName: "M3 runner fixture",
              locale: "en" as const,
              variables: {
                ctaUrl: "https://example.test/member",
                memberName: "M3 runner fixture",
                renewalDate: "2000-02-01",
                renewalUrl: "https://example.test/renew",
                amountDue: "HKD 100",
                paymentUrl: "https://example.test/pay",
              },
              unsubscribeUrl: "https://example.test/unsubscribe",
              membershipStatus: null,
            };
          },
          async renderEmail(input) {
            return {
              subject: `${input.template}-subject`,
              html: `<p>${input.template}</p>`,
              text: input.template,
              headers: {},
            };
          },
          emailTransport: {send: providerSend},
          whatsappTransport: {
            async sendTemplateMessage() {
              return {
                status: "skipped" as const,
                reason: "recipient_ineligible" as const,
              };
            },
          },
          emailFrom: "WTIA <members@example.test>",
        } satisfies JourneyRunnerDependencies;

        await activePool.query(
          `INSERT INTO journey_state
             (id, profile_id, membership_id, journey, instance_key, step,
              scheduled_at, status, attempt_count, claimed_at,
              claim_expires_at, delivery_key, error_code, completed_at)
           VALUES (
             $1, $2, NULL, 'onboarding_90d', $3, 'welcome',
             $4, 'failed', 1, $5, NULL, $6, 'provider_client_error', $5
           )`,
          [
            adminRetryJourneyId,
            profileId,
            `admin-retry:${fixture}`,
            new Date(adminRetryNow.getTime() - 60_000),
            new Date(adminRetryNow.getTime() - 30_000),
            adminRetryDeliveryKey,
          ],
        );
        await activePool.query(
          `INSERT INTO email_log
             (profile_id, journey_state_id, template, subject, status,
              provider_id, idempotency_key, locale, classification,
              attempt_count, error_code)
           VALUES (
             $1, $2, 'welcome', 'welcome-subject', 'failed', NULL,
             $3, 'en', 'transactional', 1, 'provider_client_error'
           )`,
          [profileId, adminRetryJourneyId, adminRetryDeliveryKey],
        );

        const blocked = await runJourneyBatch(dependencies, {
          now: adminRetryNow,
          limit: 1,
        });
        expect(blocked).toMatchObject({claimed: 0, sent: 0});
        expect(providerSend).not.toHaveBeenCalled();
        const blockedDelivery = await activePool.query<{
          status: string;
          attempt_count: number;
          error_code: string | null;
        }>(
          `SELECT status, attempt_count, error_code
           FROM email_log
           WHERE idempotency_key = $1`,
          [adminRetryDeliveryKey],
        );
        expect(blockedDelivery.rows).toEqual([{
          status: "failed",
          attempt_count: 1,
          error_code: "provider_client_error",
        }]);

        await expect(journeys.retryFailed(
          adminActor,
          adminRetryJourneyId,
          adminRetryNow,
        )).resolves.toMatchObject({
          id: adminRetryJourneyId,
          status: "scheduled",
          errorCode: "admin_retry_authorized",
        });

        const authorizedDelivery = await activePool.query<{
          status: string;
          attempt_count: number;
          error_code: string | null;
        }>(
          `SELECT status, attempt_count, error_code
           FROM email_log
           WHERE idempotency_key = $1`,
          [adminRetryDeliveryKey],
        );
        expect(authorizedDelivery.rows).toEqual([{
          status: "failed",
          attempt_count: 1,
          error_code: "provider_client_error",
        }]);
        const auditAfterAuthorization = await activePool.query<{
          count: number;
          delivery_key: string | null;
        }>(
          `SELECT count(*)::int AS count,
                  min(metadata->>'deliveryKey') AS delivery_key
           FROM audit_events
           WHERE action = 'journey.failed_retry_requested'
             AND target_type = 'journey_state'
             AND target_id = $1`,
          [adminRetryJourneyId],
        );
        expect(auditAfterAuthorization.rows).toEqual([{
          count: 1,
          delivery_key: adminRetryDeliveryKey,
        }]);

        const summary = await runJourneyBatch(dependencies, {
          now: adminRetryNow,
          limit: 1,
        });
        expect(summary).toMatchObject({
          claimed: 1,
          sent: 1,
          failed: 0,
        });
        expect(providerSend).toHaveBeenCalledTimes(1);

        const finalDelivery = await activePool.query<{
          status: string;
          attempt_count: number;
          provider_id: string | null;
          count: number;
        }>(
          `SELECT min(status) AS status,
                  min(attempt_count)::int AS attempt_count,
                  min(provider_id) AS provider_id,
                  count(*)::int AS count
           FROM email_log
           WHERE idempotency_key = $1`,
          [adminRetryDeliveryKey],
        );
        expect(finalDelivery.rows).toEqual([{
          status: "sent",
          attempt_count: 2,
          provider_id: `provider-${fixture}-admin-retry`,
          count: 1,
        }]);
        const finalJourney = await activePool.query<{
          status: string;
          attempt_count: number;
        }>(
          `SELECT status, attempt_count
           FROM journey_state
           WHERE id = $1`,
          [adminRetryJourneyId],
        );
        expect(finalJourney.rows).toEqual([{
          status: "sent",
          attempt_count: 2,
        }]);
        const finalAudit = await activePool.query<{count: number}>(
          `SELECT count(*)::int AS count
           FROM audit_events
           WHERE action = 'journey.failed_retry_requested'
             AND target_type = 'journey_state'
             AND target_id = $1`,
          [adminRetryJourneyId],
        );
        expect(finalAudit.rows).toEqual([{count: 1}]);
      },
    );

    it(
      "runs concurrent campaign workers once and keeps the frozen source mapped to campaign_generic",
      async () => {
        const activeDatabase = requireDatabase();
        const activePool = requirePool();
        const loadDatabase = async () => activeDatabase;
        const campaignRecipients =
          createCampaignRecipientDeliveryRepository(loadDatabase);
        const deliveries = createDeliveriesRepository(loadDatabase);
        const staffTaskRepo = createStaffTasksRepository(loadDatabase);
        const rendered: CampaignRenderInput[] = [];
        const providerSend = vi.fn(async () => ({
          status: "sent" as const,
          providerId: `provider-${fixture}-campaign`,
        }));
        const dependencies = {
          campaigns: campaignRecipients,
          deliveries,
          staffTasks: staffTaskRepo,
          async loadContext(_actor, requestedProfileId) {
            const profile = await activePool.query<{
              consent_marketing: boolean;
            }>(
              `SELECT consent_marketing
               FROM profiles
               WHERE id = $1`,
              [requestedProfileId],
            );
            const row = profile.rows[0];
            if (!row) throw new Error("MISSING_CAMPAIGN_PROFILE");
            return {
              marketingConsent: row.consent_marketing,
              emailSuppressed: false,
              unsubscribeUrl: "https://example.test/unsubscribe",
            };
          },
          async renderCampaign(input) {
            rendered.push(input);
            return {
              subject: "campaign-subject",
              html: "<p>campaign</p>",
              text: "campaign",
              headers: {},
            };
          },
          emailTransport: {send: providerSend},
          emailFrom: "WTIA <members@example.test>",
        } satisfies CampaignRunnerDependencies;

        await activePool.query(
          `INSERT INTO campaigns
             (id, segment_id, created_by_profile_id, template,
              locale_strategy, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, 'renewal-reminder', 'profile', 'queued',
                   $4, '1900-01-01T00:00:00.000Z')`,
          [campaignId, segmentId, profileId, `${fixture}-campaign`],
        );
        const variables = {
          displayName: "M3 runner fixture",
          ctaUrl: "https://example.test/campaign",
        };
        await activePool.query(
          `INSERT INTO campaign_recipients
             (id, campaign_id, profile_id, email, locale, variables)
           VALUES ($1, $2, $3, $4, 'en', $5::jsonb)`,
          [
            campaignRecipientId,
            campaignId,
            profileId,
            `${fixture}@example.test`,
            JSON.stringify(variables),
          ],
        );
        await expect(activePool.query(
          `INSERT INTO campaign_recipients
             (campaign_id, profile_id, email, locale, variables)
           VALUES ($1, $2, $3, 'en', $4::jsonb)`,
          [
            campaignId,
            profileId,
            `${fixture}@example.test`,
            JSON.stringify(variables),
          ],
        )).rejects.toMatchObject({code: "23505"});

        const summaries = await Promise.all([
          runCampaignBatch(dependencies, {now: campaignNow, limit: 1}),
          runCampaignBatch(dependencies, {now: campaignNow, limit: 1}),
        ]);

        expect(total(summaries, "claimed")).toBe(1);
        expect(total(summaries, "sent")).toBe(1);
        expect(providerSend).toHaveBeenCalledTimes(1);
        expect(rendered).toEqual([{
          sourceTemplate: "renewal-reminder",
          template: "campaign_generic",
          locale: "en",
          variables,
          unsubscribeUrl: "https://example.test/unsubscribe",
        }]);
        const log = await activePool.query<{
          status: string;
          template: string;
          attempt_count: number;
          count: number;
        }>(
          `SELECT min(status) AS status, min(template) AS template,
                  min(attempt_count)::int AS attempt_count,
                  count(*)::int AS count
           FROM email_log
           WHERE idempotency_key = $1`,
          [campaignKey],
        );
        expect(log.rows).toEqual([{
          status: "sent",
          template: "campaign_generic",
          attempt_count: 1,
          count: 1,
        }]);
        const recipient = await activePool.query<{
          recipient_status: string;
          campaign_status: string;
          attempt_count: number;
        }>(
          `SELECT recipient.status AS recipient_status,
                  campaign.status AS campaign_status,
                  recipient.attempt_count
           FROM campaign_recipients AS recipient
           INNER JOIN campaigns AS campaign
             ON campaign.id = recipient.campaign_id
           WHERE recipient.id = $1`,
          [campaignRecipientId],
        );
        expect(recipient.rows).toEqual([{
          recipient_status: "sent",
          campaign_status: "completed",
          attempt_count: 1,
        }]);
      },
    );

    it(
      "reclaims a campaign lease and fences the stale token on real Postgres",
      async () => {
        const activeDatabase = requireDatabase();
        const activePool = requirePool();
        const repository = createCampaignRecipientDeliveryRepository(
          async () => activeDatabase,
        );
        const oldClaimedAt = new Date("1999-12-30T00:00:00.000Z");
        const reclaimedAt = new Date("2000-01-03T00:00:00.000Z");

        await activePool.query(
          `INSERT INTO campaigns
             (id, segment_id, created_by_profile_id, template,
              locale_strategy, status, idempotency_key, created_at)
           VALUES ($1, $2, $3, 'member-update', 'profile', 'processing',
                   $4, '1899-01-01T00:00:00.000Z')`,
          [fencedCampaignId, segmentId, profileId, `${fixture}-fenced`],
        );
        await activePool.query(
          `INSERT INTO campaign_recipients
             (id, campaign_id, profile_id, email, locale, variables,
              status, attempt_count, claimed_at, claim_expires_at)
           VALUES ($1, $2, $3, $4, 'en', '{}'::jsonb,
                   'processing', 1, $5, $6)`,
          [
            fencedRecipientId,
            fencedCampaignId,
            profileId,
            `${fixture}@example.test`,
            oldClaimedAt,
            new Date("1999-12-31T00:00:00.000Z"),
          ],
        );

        const claims = await repository.claimRecipients(
          cronActor,
          reclaimedAt,
          1,
          300_000,
        );
        expect(claims).toMatchObject([{
          id: fencedRecipientId,
          attemptCount: 2,
          claimedAt: reclaimedAt,
          claimSource: "stale",
        }]);
        await expect(repository.markRecipientSent(
          cronActor,
          fencedRecipientId,
          oldClaimedAt,
        )).rejects.toThrow("INVALID_CAMPAIGN_RECIPIENT_TRANSITION");
        await expect(repository.markRecipientSent(
          cronActor,
          fencedRecipientId,
          reclaimedAt,
        )).resolves.toBeTruthy();
      },
    );

    it("rolls back a failed transaction against the current task schema", async () => {
      const activeDatabase = requireDatabase();
      const activePool = requirePool();
      const rollbackKey = `${fixture}:rollback`;

      await expect(activeDatabase.transaction(async (transaction) => {
        await transaction.execute(sql`
          INSERT INTO ${staffTasks}
            (profile_id, journey_state_id, kind, dedupe_key, summary_code)
          VALUES (
            ${profileId}, NULL, 'rollback_probe', ${rollbackKey}, 'rollback_probe'
          )
        `);
        throw new Error("ROLLBACK_PROBE");
      })).rejects.toThrow("ROLLBACK_PROBE");

      const count = await activePool.query<{count: number}>(
        `SELECT count(*)::int AS count
         FROM staff_tasks
         WHERE dedupe_key = $1`,
        [rollbackKey],
      );
      expect(count.rows).toEqual([{count: 0}]);
    });
  },
);
