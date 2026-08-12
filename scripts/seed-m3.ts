import {Pool} from "pg";

import {assertIsolatedSeedEnvironment} from "./lib/acceptance-guard.ts";

export const M3_SEED_NOW_ENV = "M3_SEED_NOW";

export const M3_PROFILE_IDS = {
  campaignEligible: "m3-campaign-eligible",
  day7LoggedIn: "m3-day7-logged-in",
  day7NoLogin: "m3-day7-no-login",
  engagementMember: "m3-engagement-member",
  marketingUnsubscribed: "m3-marketing-unsubscribed",
  memberAccess: "m3-member-access",
  renewalWhatsappOptedIn: "m3-renewal-whatsapp-opted-in",
  renewalWhatsappOptedOut: "m3-renewal-whatsapp-opted-out",
  staffAdmin: "m3-staff-admin",
} as const;

export const M3_SEED_UUIDS = {
  memberships: {
    marketingUnsubscribed: "30000001-0000-4000-8000-000000000001",
    memberAccess: "30000001-0000-4000-8000-000000000002",
    renewalWhatsappOptedIn: "30000001-0000-4000-8000-000000000003",
    renewalWhatsappOptedOut: "30000001-0000-4000-8000-000000000004",
  },
  journeys: {
    noLoginNudge: "31000001-0000-4000-8000-000000000001",
    noLoginMixer: "31000001-0000-4000-8000-000000000002",
    loggedInNudge: "31000001-0000-4000-8000-000000000003",
    loggedInMixer: "31000001-0000-4000-8000-000000000004",
    marketingUnsubscribedRenewal:
      "31000001-0000-4000-8000-000000000005",
    renewalWhatsappOptedIn:
      "31000001-0000-4000-8000-000000000006",
    renewalWhatsappOptedOut:
      "31000001-0000-4000-8000-000000000007",
    failedDunning: "31000001-0000-4000-8000-000000000008",
  },
  concurrentJourney: "31000001-0000-4000-8000-000000000009",
  suppression: "32000001-0000-4000-8000-000000000001",
  engagementEvent: "32000001-0000-4000-8000-000000000002",
  failedEmail: "32000001-0000-4000-8000-000000000003",
  segment: "33000001-0000-4000-8000-000000000001",
  campaign: "33000001-0000-4000-8000-000000000002",
  campaignRecipients: {
    eligible: "33000001-0000-4000-8000-000000000003",
    suppressed: "33000001-0000-4000-8000-000000000004",
  },
  approval: "34000001-0000-4000-8000-000000000001",
  failedJob: "34000001-0000-4000-8000-000000000002",
} as const;

type M3Role = "member" | "staff";
type M3Locale = "en" | "zh-HK";
type M3MembershipStatus = "active" | "past_due";

type M3ProfileFixture = Readonly<{
  id: string;
  authUserId: string;
  email: string;
  role: M3Role;
  lastLoginAt: Date | null;
  consentMarketing: boolean;
  interests: readonly string[];
  displayName: string;
  phone: string | null;
  jobTitle: string;
  locale: M3Locale;
  onboardingState: "complete";
  directoryVisible: boolean;
  whatsappOptIn: boolean;
  whatsappNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type M3MembershipFixture = Readonly<{
  id: string;
  profileId: string;
  status: M3MembershipStatus;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  createdAt: Date;
  updatedAt: Date;
}>;

type M3JourneyFixture = Readonly<{
  id: string;
  profileId: string;
  membershipId: string | null;
  journey: string;
  instanceKey: string;
  step: string;
  scheduledAt: Date;
  status: "scheduled" | "failed";
  attemptCount: number;
  deliveryKey: string;
  errorCode: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}>;

type M3SuppressionFixture = Readonly<{
  id: string;
  profileId: string;
  channel: "email";
  classification: "marketing";
  reasonCode: string;
  createdAt: Date;
}>;

type M3CampaignRecipientFixture = Readonly<{
  id: string;
  campaignId: string;
  profileId: string;
  email: string;
  locale: M3Locale;
  variables: Readonly<Record<string, string>>;
}>;

type M3ApprovalFixture = Readonly<{
  id: string;
  actionType: string;
  payload: Readonly<Record<string, unknown>>;
  requestedByProfileId: string;
  requestedAt: Date;
}>;

type M3JobFixture = Readonly<{
  id: string;
  runKey: string;
  kind: "worker-alert";
  state: "failed";
  attemptCount: number;
  lastError: string;
  createdAt: Date;
  updatedAt: Date;
}>;

type M3SeedFixture = Readonly<{
  now: Date;
  hongKongDayStart: Date;
  onboardingActivatedAt: Date;
  profiles: readonly M3ProfileFixture[];
  memberships: readonly M3MembershipFixture[];
  journeys: readonly M3JourneyFixture[];
  suppressions: readonly M3SuppressionFixture[];
  engagementEvents: readonly Readonly<{
    id: string;
    profileId: string;
    type: string;
    points: number;
    metadata: Readonly<Record<string, unknown>>;
    occurredAt: Date;
  }>[];
  engagementScores: readonly Readonly<{
    profileId: string;
    score: number;
    trend: number;
    computedAt: Date;
  }>[];
  failedEmails: readonly Readonly<{
    id: string;
    profileId: string;
    journeyStateId: string;
    template: string;
    subject: string;
    status: "failed";
    idempotencyKey: string;
    locale: M3Locale;
    classification: "transactional";
    attemptCount: number;
    errorCode: string;
    createdAt: Date;
  }>[];
  segment: Readonly<{
    id: string;
    ownerProfileId: string;
    nameEn: string;
    nameZh: string;
    filters: Readonly<Record<string, unknown>>;
    createdAt: Date;
    updatedAt: Date;
  }>;
  campaign: Readonly<{
    id: string;
    segmentId: string;
    createdByProfileId: string;
    template: string;
    idempotencyKey: string;
    createdAt: Date;
  }>;
  campaignRecipients: readonly M3CampaignRecipientFixture[];
  approvals: readonly M3ApprovalFixture[];
  jobs: readonly M3JobFixture[];
}>;

type SeedConnection = Readonly<{
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<unknown>;
  release: () => void;
}>;

export type M3SeedPool = Readonly<{
  connect: () => Promise<SeedConnection>;
}>;

const HONG_KONG_OFFSET_MS = 8 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;
const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function shifted(instant: Date, milliseconds: number): Date {
  return new Date(instant.getTime() + milliseconds);
}

function hongKongDayStart(instant: Date): Date {
  const hongKongInstant = shifted(instant, HONG_KONG_OFFSET_MS);
  return new Date(
    Date.UTC(
      hongKongInstant.getUTCFullYear(),
      hongKongInstant.getUTCMonth(),
      hongKongInstant.getUTCDate(),
    ) - HONG_KONG_OFFSET_MS,
  );
}

function profile(
  id: string,
  input: Readonly<{
    role?: M3Role;
    lastLoginAt?: Date | null;
    consentMarketing?: boolean;
    locale?: M3Locale;
    whatsappOptIn?: boolean;
    whatsappNumber?: string | null;
    createdAt: Date;
  }>,
): M3ProfileFixture {
  return {
    id,
    authUserId: `m3-test-auth-${id.slice(3)}`,
    email: `${id}@m3.example.test`,
    role: input.role ?? "member",
    lastLoginAt: input.lastLoginAt ?? null,
    consentMarketing: input.consentMarketing ?? true,
    interests: ["m3-fixture"],
    displayName: `M3 Fixture ${id.slice(3).replaceAll("-", " ")}`,
    phone: null,
    jobTitle: input.role === "staff"
      ? "M3 Fixture Administrator"
      : "M3 Fixture Member",
    locale: input.locale ?? "en",
    onboardingState: "complete",
    directoryVisible: false,
    whatsappOptIn: input.whatsappOptIn ?? false,
    whatsappNumber: input.whatsappNumber ?? null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

function journey(
  input: Omit<
    M3JourneyFixture,
    "attemptCount" | "status" | "errorCode" | "completedAt"
  > & Partial<Pick<
    M3JourneyFixture,
    "attemptCount" | "status" | "errorCode" | "completedAt"
  >>,
): M3JourneyFixture {
  return {
    ...input,
    status: input.status ?? "scheduled",
    attemptCount: input.attemptCount ?? 0,
    errorCode: input.errorCode ?? null,
    completedAt: input.completedAt ?? null,
  };
}

export function parseM3SeedNow(value: string | undefined): Date {
  const candidate = value?.trim();
  if (!candidate) throw new Error("M3_SEED_NOW_REQUIRED");
  if (!ISO_WITH_TIMEZONE.test(candidate)) {
    throw new Error("M3_SEED_NOW_INVALID");
  }
  const instant = new Date(candidate);
  if (Number.isNaN(instant.getTime())) {
    throw new Error("M3_SEED_NOW_INVALID");
  }
  return instant;
}

export function buildM3SeedFixture(now: Date): M3SeedFixture {
  if (Number.isNaN(now.getTime())) throw new Error("M3_SEED_NOW_INVALID");

  const controlledNow = new Date(now);
  const dayStart = hongKongDayStart(controlledNow);
  const onboardingActivatedAt = shifted(dayStart, -7 * DAY_MS);
  const renewalAt = shifted(dayStart, 14 * DAY_MS);
  const createdAt = shifted(dayStart, -30 * DAY_MS);
  const recentlyLoggedInAt = shifted(controlledNow, -DAY_MS);

  const profiles = [
    profile(M3_PROFILE_IDS.campaignEligible, {createdAt}),
    profile(M3_PROFILE_IDS.day7LoggedIn, {
      createdAt: onboardingActivatedAt,
      lastLoginAt: recentlyLoggedInAt,
    }),
    profile(M3_PROFILE_IDS.day7NoLogin, {
      createdAt: onboardingActivatedAt,
      lastLoginAt: null,
    }),
    profile(M3_PROFILE_IDS.engagementMember, {createdAt}),
    profile(M3_PROFILE_IDS.marketingUnsubscribed, {
      createdAt,
      consentMarketing: false,
      locale: "zh-HK",
    }),
    profile(M3_PROFILE_IDS.memberAccess, {createdAt}),
    profile(M3_PROFILE_IDS.renewalWhatsappOptedIn, {
      createdAt,
      whatsappOptIn: true,
      whatsappNumber: "+85200000001",
    }),
    profile(M3_PROFILE_IDS.renewalWhatsappOptedOut, {
      createdAt,
      whatsappOptIn: false,
      whatsappNumber: "+85200000002",
    }),
    profile(M3_PROFILE_IDS.staffAdmin, {
      createdAt,
      role: "staff",
      lastLoginAt: recentlyLoggedInAt,
    }),
  ] as const;

  const memberships = [
    {
      id: M3_SEED_UUIDS.memberships.marketingUnsubscribed,
      profileId: M3_PROFILE_IDS.marketingUnsubscribed,
      status: "active",
    },
    {
      id: M3_SEED_UUIDS.memberships.memberAccess,
      profileId: M3_PROFILE_IDS.memberAccess,
      status: "past_due",
    },
    {
      id: M3_SEED_UUIDS.memberships.renewalWhatsappOptedIn,
      profileId: M3_PROFILE_IDS.renewalWhatsappOptedIn,
      status: "active",
    },
    {
      id: M3_SEED_UUIDS.memberships.renewalWhatsappOptedOut,
      profileId: M3_PROFILE_IDS.renewalWhatsappOptedOut,
      status: "active",
    },
  ].map((row) => ({
    ...row,
    status: row.status as M3MembershipStatus,
    billingPeriodStart: shifted(renewalAt, -365 * DAY_MS),
    billingPeriodEnd: renewalAt,
    createdAt,
    updatedAt: controlledNow,
  }));

  const onboardingInstance = `m3-seed:onboarding:${onboardingActivatedAt.toISOString()}`;
  const day7Rows = [
    {
      id: M3_SEED_UUIDS.journeys.noLoginNudge,
      profileId: M3_PROFILE_IDS.day7NoLogin,
      step: "day7_nudge",
    },
    {
      id: M3_SEED_UUIDS.journeys.noLoginMixer,
      profileId: M3_PROFILE_IDS.day7NoLogin,
      step: "day7_mixer",
    },
    {
      id: M3_SEED_UUIDS.journeys.loggedInNudge,
      profileId: M3_PROFILE_IDS.day7LoggedIn,
      step: "day7_nudge",
    },
    {
      id: M3_SEED_UUIDS.journeys.loggedInMixer,
      profileId: M3_PROFILE_IDS.day7LoggedIn,
      step: "day7_mixer",
    },
  ].map((row) => journey({
    ...row,
    membershipId: null,
    journey: "onboarding_90d",
    instanceKey: onboardingInstance,
    scheduledAt: dayStart,
    deliveryKey:
      `journey:${row.profileId}:onboarding_90d:${onboardingInstance}:${row.step}`,
    createdAt: onboardingActivatedAt,
    updatedAt: onboardingActivatedAt,
  }));

  const renewalRows = [
    {
      id: M3_SEED_UUIDS.journeys.marketingUnsubscribedRenewal,
      profileId: M3_PROFILE_IDS.marketingUnsubscribed,
      membershipId: M3_SEED_UUIDS.memberships.marketingUnsubscribed,
    },
    {
      id: M3_SEED_UUIDS.journeys.renewalWhatsappOptedIn,
      profileId: M3_PROFILE_IDS.renewalWhatsappOptedIn,
      membershipId: M3_SEED_UUIDS.memberships.renewalWhatsappOptedIn,
    },
    {
      id: M3_SEED_UUIDS.journeys.renewalWhatsappOptedOut,
      profileId: M3_PROFILE_IDS.renewalWhatsappOptedOut,
      membershipId: M3_SEED_UUIDS.memberships.renewalWhatsappOptedOut,
    },
  ].map((row) => {
    const instanceKey = `m3-seed:renewal:${row.membershipId}:${renewalAt.toISOString()}`;
    return journey({
      ...row,
      journey: "renewal",
      instanceKey,
      step: "renewal_14",
      scheduledAt: dayStart,
      deliveryKey:
        `journey:${row.profileId}:renewal:${instanceKey}:renewal_14`,
      createdAt,
      updatedAt: createdAt,
    });
  });

  const failedDunning = journey({
    id: M3_SEED_UUIDS.journeys.failedDunning,
    profileId: M3_PROFILE_IDS.memberAccess,
    membershipId: M3_SEED_UUIDS.memberships.memberAccess,
    journey: "dunning",
    instanceKey: "m3-seed:dunning:failed",
    step: "dunning_7",
    scheduledAt: shifted(controlledNow, -2 * 60 * 60 * 1_000),
    deliveryKey:
      `journey:${M3_PROFILE_IDS.memberAccess}:dunning:`
      + "m3-seed:dunning:failed:dunning_7",
    status: "failed",
    attemptCount: 1,
    errorCode: "provider_client_error",
    completedAt: shifted(controlledNow, -60 * 60 * 1_000),
    createdAt: shifted(controlledNow, -3 * 60 * 60 * 1_000),
    updatedAt: shifted(controlledNow, -60 * 60 * 1_000),
  });

  const suppressions = [{
    id: M3_SEED_UUIDS.suppression,
    profileId: M3_PROFILE_IDS.marketingUnsubscribed,
    channel: "email",
    classification: "marketing",
    reasonCode: "member_unsubscribed",
    createdAt,
  }] as const;

  const campaignRecipients = [
    {
      id: M3_SEED_UUIDS.campaignRecipients.eligible,
      profileId: M3_PROFILE_IDS.campaignEligible,
      locale: "en",
    },
    {
      id: M3_SEED_UUIDS.campaignRecipients.suppressed,
      profileId: M3_PROFILE_IDS.marketingUnsubscribed,
      locale: "zh-HK",
    },
  ].map((row) => ({
    ...row,
    campaignId: M3_SEED_UUIDS.campaign,
    email: `${row.profileId}@m3.example.test`,
    locale: row.locale as M3Locale,
    variables: {
      displayName: profiles.find(({id}) => id === row.profileId)!.displayName,
      renewalDate: renewalAt.toISOString().slice(0, 10),
    },
  }));

  return {
    now: controlledNow,
    hongKongDayStart: dayStart,
    onboardingActivatedAt,
    profiles,
    memberships,
    journeys: [...day7Rows, ...renewalRows, failedDunning],
    suppressions,
    engagementEvents: [{
      id: M3_SEED_UUIDS.engagementEvent,
      profileId: M3_PROFILE_IDS.engagementMember,
      type: "event_attended",
      points: 25,
      metadata: {fixture: "m3"},
      occurredAt: shifted(controlledNow, -7 * DAY_MS),
    }],
    engagementScores: [{
      profileId: M3_PROFILE_IDS.engagementMember,
      score: 0,
      trend: 0,
      computedAt: shifted(controlledNow, -DAY_MS),
    }],
    failedEmails: [{
      id: M3_SEED_UUIDS.failedEmail,
      profileId: M3_PROFILE_IDS.memberAccess,
      journeyStateId: M3_SEED_UUIDS.journeys.failedDunning,
      template: "dunning_7",
      subject: "M3 fixture failed dunning delivery",
      status: "failed",
      idempotencyKey: failedDunning.deliveryKey,
      locale: "en",
      classification: "transactional",
      attemptCount: 1,
      errorCode: "provider_client_error",
      createdAt: failedDunning.completedAt!,
    }],
    segment: {
      id: M3_SEED_UUIDS.segment,
      ownerProfileId: M3_PROFILE_IDS.staffAdmin,
      nameEn: "M3 fixed acceptance audience",
      nameZh: "M3 固定驗收受眾",
      filters: {
        profileIds: [
          M3_PROFILE_IDS.campaignEligible,
          M3_PROFILE_IDS.marketingUnsubscribed,
        ],
      },
      createdAt,
      updatedAt: controlledNow,
    },
    campaign: {
      id: M3_SEED_UUIDS.campaign,
      segmentId: M3_SEED_UUIDS.segment,
      createdByProfileId: M3_PROFILE_IDS.staffAdmin,
      template: "membership_renewal",
      idempotencyKey: "m3-seed:campaign:fixed-audience",
      createdAt,
    },
    campaignRecipients,
    approvals: [{
      id: M3_SEED_UUIDS.approval,
      actionType: "campaign.send",
      payload: {
        campaignId: M3_SEED_UUIDS.campaign,
        fixture: "m3",
      },
      requestedByProfileId: M3_PROFILE_IDS.staffAdmin,
      requestedAt: shifted(controlledNow, -73 * 60 * 60 * 1_000),
    }],
    jobs: [{
      id: M3_SEED_UUIDS.failedJob,
      runKey: "m3-seed:worker-alert",
      kind: "worker-alert",
      state: "failed",
      attemptCount: 1,
      lastError: "WORKER_ALERT_DELIVERY_FAILED",
      createdAt: shifted(controlledNow, -2 * 60 * 60 * 1_000),
      updatedAt: shifted(controlledNow, -60 * 60 * 1_000),
    }],
  };
}

async function clearFixture(
  connection: SeedConnection,
  fixture: M3SeedFixture,
): Promise<void> {
  const profileIds = fixture.profiles.map(({id}) => id);
  const journeyIds = fixture.journeys.map(({id}) => id);
  const approvalIds = fixture.approvals.map(({id}) => id);

  await connection.query(
    `DELETE FROM audit_events
     WHERE target_id = ANY($1::text[])
        OR request_id LIKE 'm3-seed:%'`,
    [[...journeyIds, ...approvalIds]],
  );
  await connection.query(
    "DELETE FROM staff_tasks WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM email_log WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM whatsapp_log WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM campaigns WHERE id = $1",
    [fixture.campaign.id],
  );
  await connection.query(
    "DELETE FROM saved_segments WHERE id = $1",
    [fixture.segment.id],
  );
  await connection.query(
    "DELETE FROM approvals WHERE id = ANY($1::uuid[])",
    [approvalIds],
  );
  await connection.query(
    "DELETE FROM journey_state WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM message_suppressions WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM engagement_events WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM engagement_scores WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM memberships WHERE owner_user_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    `DELETE FROM jobs
     WHERE id = ANY($1::uuid[])
        OR run_key LIKE 'm3-seed:%'`,
    [fixture.jobs.map(({id}) => id)],
  );
}

async function writeFixture(
  connection: SeedConnection,
  fixture: M3SeedFixture,
): Promise<void> {
  await connection.query(`
    INSERT INTO membership_plans
      (code, audience, billing_behavior, stripe_price_reference,
       annual_price_hkd, monthly_price_hkd, seat_allowance, active,
       created_at, updated_at)
    VALUES ('community', 'individual', 'free', NULL, 0, 0, 1, true, $1, $1)
    ON CONFLICT (code) DO NOTHING
  `, [fixture.now]);

  for (const row of fixture.profiles) {
    await connection.query(`
      INSERT INTO profiles
        (id, auth_user_id, email, role, last_login_at, consent_marketing,
         interests, display_name, phone, job_title, locale, onboarding_state,
         directory_visible, created_at, updated_at, whatsapp_opt_in,
         whatsapp_number)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
         $14, $15, $16, $17)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        last_login_at = EXCLUDED.last_login_at,
        consent_marketing = EXCLUDED.consent_marketing,
        interests = EXCLUDED.interests,
        display_name = EXCLUDED.display_name,
        phone = EXCLUDED.phone,
        job_title = EXCLUDED.job_title,
        locale = EXCLUDED.locale,
        onboarding_state = EXCLUDED.onboarding_state,
        directory_visible = EXCLUDED.directory_visible,
        updated_at = EXCLUDED.updated_at,
        whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
        whatsapp_number = EXCLUDED.whatsapp_number
    `, [
      row.id,
      row.authUserId,
      row.email,
      row.role,
      row.lastLoginAt,
      row.consentMarketing,
      [...row.interests],
      row.displayName,
      row.phone,
      row.jobTitle,
      row.locale,
      row.onboardingState,
      row.directoryVisible,
      row.createdAt,
      row.updatedAt,
      row.whatsappOptIn,
      row.whatsappNumber,
    ]);
  }

  for (const row of fixture.memberships) {
    await connection.query(`
      INSERT INTO memberships
        (id, owner_user_id, company_id, application_id, plan_code, status,
         billing_interval, seat_limit, stripe_customer_id,
         stripe_subscription_id, billing_period_start, billing_period_end,
         cancel_at_period_end, created_at, updated_at)
      VALUES
        ($1, $2, NULL, NULL, 'community', $3, 'annual', 1, NULL, NULL,
         $4, $5, false, $6, $7)
      ON CONFLICT (id) DO UPDATE SET
        owner_user_id = EXCLUDED.owner_user_id,
        company_id = NULL,
        application_id = NULL,
        plan_code = EXCLUDED.plan_code,
        status = EXCLUDED.status,
        billing_interval = EXCLUDED.billing_interval,
        seat_limit = EXCLUDED.seat_limit,
        stripe_customer_id = NULL,
        stripe_subscription_id = NULL,
        billing_period_start = EXCLUDED.billing_period_start,
        billing_period_end = EXCLUDED.billing_period_end,
        cancel_at_period_end = false,
        updated_at = EXCLUDED.updated_at
    `, [
      row.id,
      row.profileId,
      row.status,
      row.billingPeriodStart,
      row.billingPeriodEnd,
      row.createdAt,
      row.updatedAt,
    ]);
  }

  for (const row of fixture.journeys) {
    await connection.query(`
      INSERT INTO journey_state
        (id, profile_id, membership_id, journey, instance_key, step,
         scheduled_at, status, attempt_count, claimed_at, claim_expires_at,
         delivery_key, error_code, completed_at, created_at, updated_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, NULL, $10, $11,
         $12, $13, $14)
      ON CONFLICT (id) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        membership_id = EXCLUDED.membership_id,
        journey = EXCLUDED.journey,
        instance_key = EXCLUDED.instance_key,
        step = EXCLUDED.step,
        scheduled_at = EXCLUDED.scheduled_at,
        status = EXCLUDED.status,
        attempt_count = EXCLUDED.attempt_count,
        claimed_at = NULL,
        claim_expires_at = NULL,
        delivery_key = EXCLUDED.delivery_key,
        error_code = EXCLUDED.error_code,
        completed_at = EXCLUDED.completed_at,
        updated_at = EXCLUDED.updated_at
    `, [
      row.id,
      row.profileId,
      row.membershipId,
      row.journey,
      row.instanceKey,
      row.step,
      row.scheduledAt,
      row.status,
      row.attemptCount,
      row.deliveryKey,
      row.errorCode,
      row.completedAt,
      row.createdAt,
      row.updatedAt,
    ]);
  }

  for (const row of fixture.suppressions) {
    await connection.query(`
      INSERT INTO message_suppressions
        (id, profile_id, channel, classification, reason_code, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        channel = EXCLUDED.channel,
        classification = EXCLUDED.classification,
        reason_code = EXCLUDED.reason_code
    `, [
      row.id,
      row.profileId,
      row.channel,
      row.classification,
      row.reasonCode,
      row.createdAt,
    ]);
  }

  for (const row of fixture.engagementEvents) {
    await connection.query(`
      INSERT INTO engagement_events
        (id, profile_id, company_id, type, points, metadata, occurred_at)
      VALUES ($1, $2, NULL, $3, $4, $5::jsonb, $6)
      ON CONFLICT (id) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        company_id = NULL,
        type = EXCLUDED.type,
        points = EXCLUDED.points,
        metadata = EXCLUDED.metadata,
        occurred_at = EXCLUDED.occurred_at
    `, [
      row.id,
      row.profileId,
      row.type,
      row.points,
      JSON.stringify(row.metadata),
      row.occurredAt,
    ]);
  }

  for (const row of fixture.engagementScores) {
    await connection.query(`
      INSERT INTO engagement_scores
        (profile_id, score, trend, computed_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (profile_id) DO UPDATE SET
        score = EXCLUDED.score,
        trend = EXCLUDED.trend,
        computed_at = EXCLUDED.computed_at
    `, [row.profileId, row.score, row.trend, row.computedAt]);
  }

  for (const row of fixture.failedEmails) {
    await connection.query(`
      INSERT INTO email_log
        (id, profile_id, journey_state_id, template, subject, status,
         provider_id, idempotency_key, locale, classification, attempt_count,
         error_code, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (id) DO UPDATE SET
        profile_id = EXCLUDED.profile_id,
        journey_state_id = EXCLUDED.journey_state_id,
        template = EXCLUDED.template,
        subject = EXCLUDED.subject,
        status = EXCLUDED.status,
        provider_id = NULL,
        idempotency_key = EXCLUDED.idempotency_key,
        locale = EXCLUDED.locale,
        classification = EXCLUDED.classification,
        attempt_count = EXCLUDED.attempt_count,
        error_code = EXCLUDED.error_code
    `, [
      row.id,
      row.profileId,
      row.journeyStateId,
      row.template,
      row.subject,
      row.status,
      row.idempotencyKey,
      row.locale,
      row.classification,
      row.attemptCount,
      row.errorCode,
      row.createdAt,
    ]);
  }

  await connection.query(`
    INSERT INTO saved_segments
      (id, owner_profile_id, name_en, name_zh, filter_version, filters,
       created_at, updated_at)
    VALUES ($1, $2, $3, $4, 1, $5::jsonb, $6, $7)
    ON CONFLICT (id) DO UPDATE SET
      owner_profile_id = EXCLUDED.owner_profile_id,
      name_en = EXCLUDED.name_en,
      name_zh = EXCLUDED.name_zh,
      filter_version = EXCLUDED.filter_version,
      filters = EXCLUDED.filters,
      updated_at = EXCLUDED.updated_at
  `, [
    fixture.segment.id,
    fixture.segment.ownerProfileId,
    fixture.segment.nameEn,
    fixture.segment.nameZh,
    JSON.stringify(fixture.segment.filters),
    fixture.segment.createdAt,
    fixture.segment.updatedAt,
  ]);

  await connection.query(`
    INSERT INTO campaigns
      (id, segment_id, created_by_profile_id, template, locale_strategy,
       status, idempotency_key, created_at)
    VALUES ($1, $2, $3, $4, 'profile', 'queued', $5, $6)
    ON CONFLICT (id) DO UPDATE SET
      segment_id = EXCLUDED.segment_id,
      created_by_profile_id = EXCLUDED.created_by_profile_id,
      template = EXCLUDED.template,
      locale_strategy = EXCLUDED.locale_strategy,
      status = EXCLUDED.status,
      idempotency_key = EXCLUDED.idempotency_key
  `, [
    fixture.campaign.id,
    fixture.campaign.segmentId,
    fixture.campaign.createdByProfileId,
    fixture.campaign.template,
    fixture.campaign.idempotencyKey,
    fixture.campaign.createdAt,
  ]);

  for (const row of fixture.campaignRecipients) {
    await connection.query(`
      INSERT INTO campaign_recipients
        (id, campaign_id, profile_id, email, locale, variables, status,
         attempt_count, claimed_at, claim_expires_at, error_code)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'queued', 0, NULL, NULL, NULL)
      ON CONFLICT (id) DO UPDATE SET
        campaign_id = EXCLUDED.campaign_id,
        profile_id = EXCLUDED.profile_id,
        email = EXCLUDED.email,
        locale = EXCLUDED.locale,
        variables = EXCLUDED.variables,
        status = 'queued',
        attempt_count = 0,
        claimed_at = NULL,
        claim_expires_at = NULL,
        error_code = NULL
    `, [
      row.id,
      row.campaignId,
      row.profileId,
      row.email,
      row.locale,
      JSON.stringify(row.variables),
    ]);
  }

  for (const row of fixture.approvals) {
    await connection.query(`
      INSERT INTO approvals
        (id, action_type, payload, status, requested_by_profile_id,
         requested_at, decided_by_profile_id, decided_at)
      VALUES ($1, $2, $3::jsonb, 'pending', $4, $5, NULL, NULL)
      ON CONFLICT (id) DO UPDATE SET
        action_type = EXCLUDED.action_type,
        payload = EXCLUDED.payload,
        status = 'pending',
        requested_by_profile_id = EXCLUDED.requested_by_profile_id,
        requested_at = EXCLUDED.requested_at,
        decided_by_profile_id = NULL,
        decided_at = NULL
    `, [
      row.id,
      row.actionType,
      JSON.stringify(row.payload),
      row.requestedByProfileId,
      row.requestedAt,
    ]);
  }

  for (const row of fixture.jobs) {
    await connection.query(`
      INSERT INTO jobs
        (id, run_key, kind, state, attempt_count, last_error, created_at,
         updated_at, completed_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
      ON CONFLICT (id) DO UPDATE SET
        run_key = EXCLUDED.run_key,
        kind = EXCLUDED.kind,
        state = EXCLUDED.state,
        attempt_count = EXCLUDED.attempt_count,
        last_error = EXCLUDED.last_error,
        updated_at = EXCLUDED.updated_at,
        completed_at = NULL
    `, [
      row.id,
      row.runKey,
      row.kind,
      row.state,
      row.attemptCount,
      row.lastError,
      row.createdAt,
      row.updatedAt,
    ]);
  }
}

export async function seedM3(
  pool: M3SeedPool,
  input: Readonly<{now: Date}>,
): Promise<void> {
  const fixture = buildM3SeedFixture(input.now);
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      ["hkwtia:m3-seed"],
    );
    await clearFixture(connection, fixture);
    await writeFixture(connection, fixture);
    await connection.query("COMMIT");
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      // Preserve the fixture write error.
    }
    throw error;
  } finally {
    connection.release();
  }
}

export async function runM3Seed(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<void> {
  // `npm run db:seed:m3` is callable directly, so the guard has to live here
  // rather than in a wrapper script nothing forces callers through.
  assertIsolatedSeedEnvironment(environment, {
    prefix: "M3_ACCEPTANCE",
    flag: "M3_ACCEPTANCE_SEED",
  });
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to seed M3 fixtures.");
  }
  const now = parseM3SeedNow(environment[M3_SEED_NOW_ENV]);
  const pool = new Pool({connectionString: databaseUrl});
  try {
    await seedM3(pool, {now});
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-m3.ts")) {
  runM3Seed().catch((error: unknown) => {
    // A guard rejection and a real database error are different problems, and
    // a fixed string makes them indistinguishable to whoever is debugging.
    console.error(error instanceof Error ? error.message : "M3 database seed failed.");
    process.exitCode = 1;
  });
}
