import {fileURLToPath} from "node:url";

import {Pool} from "pg";

import {previousHongKongMonthWindow} from "@/lib/ai/board-reporter/reporting-window";
import {M4B_ACCEPTANCE_OWNERSHIP_KEY} from "@/lib/acceptance/m4b-ownership";
import {hongKongDateKey} from "@/lib/automation/hong-kong-time";

export const M4B_ACCEPTANCE_SEED_ENV = "M4B_ACCEPTANCE_SEED";

const AS_OF = new Date("2030-07-15T02:00:00.000Z");
const PROFILE_IDS = {
  lowScore: "m4b-acceptance-low-score",
  inactive: "m4b-acceptance-inactive",
  both: "m4b-acceptance-both",
  nonqualifier: "m4b-acceptance-nonqualifier",
} as const;
const MEMBERSHIP_IDS = {
  lowScore: "40000001-0000-4000-8000-000000000001",
  inactive: "40000001-0000-4000-8000-000000000002",
  both: "40000001-0000-4000-8000-000000000003",
  nonqualifier: "40000001-0000-4000-8000-000000000004",
} as const;
const APPLICATION_IDS = Array.from(
  {length: 6},
  (_, index) =>
    `40000002-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);
const EVENT_ID = "40000003-0000-4000-8000-000000000001";
const ENGAGEMENT_EVENT_IDS = Array.from(
  {length: 3},
  (_, index) =>
    `40000004-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
);

const profiles = [
  {
    id: PROFILE_IDS.lowScore,
    lastLoginAt: new Date("2030-06-25T02:00:00.000Z"),
    score: 10,
    trend: -2,
    renewalAt: new Date("2030-12-01T00:00:00.000Z"),
    membershipId: MEMBERSHIP_IDS.lowScore,
    qualifiesForRetention: true,
  },
  {
    id: PROFILE_IDS.inactive,
    lastLoginAt: new Date("2030-03-01T00:00:00.000Z"),
    score: 60,
    trend: 2,
    renewalAt: new Date("2030-08-01T00:00:00.000Z"),
    membershipId: MEMBERSHIP_IDS.inactive,
    qualifiesForRetention: true,
  },
  {
    id: PROFILE_IDS.both,
    lastLoginAt: new Date("2030-02-15T00:00:00.000Z"),
    score: 12,
    trend: -1,
    renewalAt: new Date("2030-08-15T00:00:00.000Z"),
    membershipId: MEMBERSHIP_IDS.both,
    qualifiesForRetention: true,
  },
  {
    id: PROFILE_IDS.nonqualifier,
    lastLoginAt: new Date("2030-06-25T02:00:00.000Z"),
    score: 80,
    trend: 3,
    renewalAt: new Date("2030-12-15T00:00:00.000Z"),
    membershipId: MEMBERSHIP_IDS.nonqualifier,
    qualifiesForRetention: false,
  },
] as const;

export const M4B_ACCEPTANCE_FIXTURE = {
  asOf: AS_OF,
  reportMonth: "2030-06",
  sourceLabel: M4B_ACCEPTANCE_OWNERSHIP_KEY,
  profiles,
  expectedAtRiskProfileIds: [
    PROFILE_IDS.lowScore,
    PROFILE_IDS.inactive,
    PROFILE_IDS.both,
  ],
  expectedBoardMetrics: [
    {id: "arr_hkd", value: 10800, unit: "HKD"},
    {id: "mrr_hkd", value: 900, unit: "HKD"},
    {
      id: "renewal_rate",
      value: 66.7,
      unit: "percent",
      numerator: 2,
      denominator: 3,
    },
    {
      id: "first_year_renewal_rate",
      value: 50,
      unit: "percent",
      numerator: 1,
      denominator: 2,
    },
    {id: "funnel_started", value: 6, unit: "count"},
    {id: "funnel_profile_completed", value: 5, unit: "count"},
    {id: "funnel_checkout_or_review", value: 4, unit: "count"},
    {id: "funnel_activated", value: 3, unit: "count"},
    {
      id: "attendance_rate",
      value: 75,
      unit: "percent",
      numerator: 3,
      denominator: 4,
    },
    {id: "at_risk_count", value: 3, unit: "count"},
  ],
} as const;

const DAY_MS = 86_400_000;
const AGENT_RUN_OWNERSHIP_MARKER =
  `m4b-acceptance-owner:${M4B_ACCEPTANCE_OWNERSHIP_KEY}`;

function offsetDate(base: Date, days: number): Date {
  return new Date(base.getTime() + days * DAY_MS);
}

export function buildM4BAcceptanceFixture(asOf = new Date()) {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("M4B_ACCEPTANCE_AS_OF_INVALID");
  }
  const reportWindow = previousHongKongMonthWindow(asOf);
  const dynamicProfiles = [
    {
      ...profiles[0],
      lastLoginAt: offsetDate(asOf, -10),
      renewalAt: offsetDate(asOf, 180),
    },
    {
      ...profiles[1],
      lastLoginAt: offsetDate(asOf, -100),
      renewalAt: offsetDate(asOf, 30),
    },
    {
      ...profiles[2],
      lastLoginAt: offsetDate(asOf, -110),
      renewalAt: offsetDate(asOf, 45),
    },
    {
      ...profiles[3],
      lastLoginAt: offsetDate(asOf, -10),
      renewalAt: offsetDate(asOf, 180),
    },
  ] as const;
  const retentionDate = hongKongDateKey(asOf);
  return {
    ...M4B_ACCEPTANCE_FIXTURE,
    asOf: new Date(asOf),
    reportMonth: reportWindow.reportMonth,
    reportWindow,
    profiles: dynamicProfiles,
    agentRunOwnershipMarker: AGENT_RUN_OWNERSHIP_MARKER,
    retentionRequestKeys: M4B_ACCEPTANCE_FIXTURE.expectedAtRiskProfileIds
      .map((profileId) =>
        `retention:${retentionDate}:${profileId}:retention-analyst-v1`
      ),
    boardSourceKey:
      `board-report:${reportWindow.reportMonth}:board-reporter-v1`,
    createdAt: offsetDate(reportWindow.utc.from, -180),
    applicationDates: APPLICATION_IDS.map((_, index) =>
      offsetDate(reportWindow.utc.from, index + 1)
    ),
    renewalDates: ENGAGEMENT_EVENT_IDS.map((_, index) =>
      offsetDate(reportWindow.utc.from, index + 9)
    ),
    eventStart: offsetDate(reportWindow.utc.from, 19),
  } as const;
}

export type M4BAcceptanceFixture =
  ReturnType<typeof buildM4BAcceptanceFixture>;

type SeedConnection = Readonly<{
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<unknown>;
  release: () => void;
}>;

export type M4BSeedPool = Readonly<{
  connect: () => Promise<SeedConnection>;
}>;

async function clearGeneratedEffects(
  connection: SeedConnection,
  fixture: M4BAcceptanceFixture,
): Promise<void> {
  const profileIds = fixture.profiles.map(({id}) => id);
  const markerValues = [
    fixture.agentRunOwnershipMarker,
    `${fixture.agentRunOwnershipMarker}:%`,
  ] as const;
  await connection.query(
    `DELETE FROM approvals AS effects
     USING agent_runs AS owned
     WHERE effects.payload ->> 'agentRunId' = owned.id::text
       AND owned.agent = 'retention_analyst'
       AND (owned.summary = $1 OR owned.summary LIKE $2)`,
    markerValues,
  );
  await connection.query(
    `DELETE FROM posts AS effects
     USING agent_runs AS owned
     WHERE effects.agent_run_id = owned.id
       AND owned.agent = 'board_reporter'
       AND (owned.summary = $1 OR owned.summary LIKE $2)`,
    markerValues,
  );
  await connection.query(
    `DELETE FROM agent_runs
     WHERE agent IN ('retention_analyst', 'board_reporter')
       AND (summary = $1 OR summary LIKE $2)`,
    markerValues,
  );
  await connection.query(
    "DELETE FROM approvals WHERE request_key = ANY($1::text[])",
    [fixture.retentionRequestKeys],
  );
  await connection.query(
    "DELETE FROM posts WHERE source_key = $1",
    [fixture.boardSourceKey],
  );
  await connection.query(
    "DELETE FROM email_log WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
  await connection.query(
    "DELETE FROM whatsapp_log WHERE profile_id = ANY($1::text[])",
    [profileIds],
  );
}

async function writeBaseFixture(
  connection: SeedConnection,
  fixture: M4BAcceptanceFixture,
): Promise<void> {
  await connection.query(
    `INSERT INTO membership_plans
       (code, audience, billing_behavior, stripe_price_reference,
        annual_price_hkd, monthly_price_hkd, seat_allowance, active,
        created_at, updated_at)
     VALUES ('startup', 'startup', 'checkout', NULL, 2400, 250, 5, true,
       $1, $1)
     ON CONFLICT (code) DO UPDATE SET
       annual_price_hkd = EXCLUDED.annual_price_hkd,
       monthly_price_hkd = EXCLUDED.monthly_price_hkd,
       updated_at = EXCLUDED.updated_at`,
    [fixture.createdAt],
  );

  for (const row of fixture.profiles) {
    await connection.query(
      `INSERT INTO profiles
         (id, auth_user_id, email, role, last_login_at, consent_marketing,
          interests, display_name, phone, job_title, locale,
          onboarding_state, directory_visible, created_at, updated_at,
          whatsapp_opt_in, whatsapp_number)
       VALUES
         ($1, $2, $3, 'member', $4, false, $5, $6, NULL,
          'M4B acceptance fixture', 'en', 'complete', false, $7, $7,
          false, NULL)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         role = EXCLUDED.role,
         last_login_at = EXCLUDED.last_login_at,
         consent_marketing = EXCLUDED.consent_marketing,
         interests = EXCLUDED.interests,
         display_name = EXCLUDED.display_name,
         job_title = EXCLUDED.job_title,
         locale = EXCLUDED.locale,
         onboarding_state = EXCLUDED.onboarding_state,
         directory_visible = EXCLUDED.directory_visible,
         updated_at = EXCLUDED.updated_at,
         whatsapp_opt_in = EXCLUDED.whatsapp_opt_in,
         whatsapp_number = EXCLUDED.whatsapp_number`,
      [
        row.id,
        `m4b-acceptance-auth-${row.id}`,
        `${row.id}@example.test`,
        row.lastLoginAt,
        [fixture.sourceLabel],
        row.id.replaceAll("-", " "),
        fixture.createdAt,
      ],
    );
  }

  const applicationRows = [
    [APPLICATION_IDS[0], PROFILE_IDS.lowScore, "complete", "completed"],
    [APPLICATION_IDS[1], PROFILE_IDS.inactive, "complete", "completed"],
    [APPLICATION_IDS[2], PROFILE_IDS.both, "complete", "completed"],
    [APPLICATION_IDS[3], PROFILE_IDS.nonqualifier, "review", "pending_review"],
    [APPLICATION_IDS[4], PROFILE_IDS.nonqualifier, "company", "draft"],
    [APPLICATION_IDS[5], PROFILE_IDS.nonqualifier, "profile", "draft"],
  ] as const;
  for (const [id, applicantUserId, currentStep, status] of applicationRows) {
    await connection.query(
      `INSERT INTO membership_applications
         (id, applicant_user_id, plan_code, company_id, current_step, status,
          created_at, updated_at)
       VALUES ($1, $2, 'startup', NULL, $3, $4, $5, $5)
       ON CONFLICT (id) DO UPDATE SET
         applicant_user_id = EXCLUDED.applicant_user_id,
         plan_code = EXCLUDED.plan_code,
         company_id = NULL,
         current_step = EXCLUDED.current_step,
         status = EXCLUDED.status,
         created_at = EXCLUDED.created_at,
         updated_at = EXCLUDED.updated_at`,
      [
        id,
        applicantUserId,
        currentStep,
        status,
        fixture.applicationDates[applicationRows.findIndex(
          (candidate) => candidate[0] === id,
        )],
      ],
    );
  }

  for (const [index, row] of fixture.profiles.entries()) {
    await connection.query(
      `INSERT INTO memberships
         (id, owner_user_id, company_id, application_id, plan_code, status,
          billing_interval, seat_limit, stripe_customer_id,
          stripe_subscription_id, billing_period_start, billing_period_end,
          cancel_at_period_end, created_at, updated_at)
       VALUES
         ($1, $2, NULL, $3, 'startup', 'active', $4, 5, NULL, NULL,
          $5, $6, false, $7, $7)
       ON CONFLICT (id) DO UPDATE SET
         owner_user_id = EXCLUDED.owner_user_id,
         company_id = NULL,
         application_id = EXCLUDED.application_id,
         plan_code = EXCLUDED.plan_code,
         status = EXCLUDED.status,
         billing_interval = EXCLUDED.billing_interval,
         seat_limit = EXCLUDED.seat_limit,
         stripe_customer_id = NULL,
         stripe_subscription_id = NULL,
         billing_period_start = EXCLUDED.billing_period_start,
         billing_period_end = EXCLUDED.billing_period_end,
         cancel_at_period_end = false,
         updated_at = EXCLUDED.updated_at`,
      [
        row.membershipId,
        row.id,
        index < 3 ? APPLICATION_IDS[index] : null,
        index % 2 === 0 ? "annual" : "monthly",
        fixture.createdAt,
        row.renewalAt,
        fixture.createdAt,
      ],
    );
    await connection.query(
      `INSERT INTO engagement_scores
         (profile_id, score, trend, computed_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (profile_id) DO UPDATE SET
         score = EXCLUDED.score,
         trend = EXCLUDED.trend,
         computed_at = EXCLUDED.computed_at`,
      [row.id, row.score, row.trend, fixture.asOf],
    );
  }
}

async function writeReportFacts(
  connection: SeedConnection,
  fixture: M4BAcceptanceFixture,
): Promise<void> {
  const renewalRows = [
    {
      id: ENGAGEMENT_EVENT_IDS[0],
      profileId: PROFILE_IDS.lowScore,
      membershipId: MEMBERSHIP_IDS.lowScore,
      type: "renewal_paid",
      ordinal: 1,
      points: 10,
    },
    {
      id: ENGAGEMENT_EVENT_IDS[1],
      profileId: PROFILE_IDS.inactive,
      membershipId: MEMBERSHIP_IDS.inactive,
      type: "renewal_failed",
      ordinal: 1,
      points: -10,
    },
    {
      id: ENGAGEMENT_EVENT_IDS[2],
      profileId: PROFILE_IDS.both,
      membershipId: MEMBERSHIP_IDS.both,
      type: "renewal_paid",
      ordinal: 2,
      points: 10,
    },
  ] as const;
  for (const [index, row] of renewalRows.entries()) {
    await connection.query(
      `INSERT INTO engagement_events
         (id, profile_id, company_id, type, points, metadata, occurred_at)
       VALUES ($1, $2, NULL, $3, $4, $5::jsonb, $6)
       ON CONFLICT (id) DO UPDATE SET
         profile_id = EXCLUDED.profile_id,
         company_id = NULL,
         type = EXCLUDED.type,
         points = EXCLUDED.points,
         metadata = EXCLUDED.metadata,
         occurred_at = EXCLUDED.occurred_at`,
      [
        row.id,
        row.profileId,
        row.type,
        row.points,
        JSON.stringify({
          fixture: fixture.sourceLabel,
          membershipId: row.membershipId,
          renewalOrdinal: row.ordinal,
        }),
        fixture.renewalDates[index],
      ],
    );
  }

  await connection.query(
    `INSERT INTO events
       (id, slug, title_en, title_zh, description_en, description_zh,
        starts_at, ends_at, venue, capacity, member_only, published,
        created_at, updated_at)
     VALUES
       ($1, 'm4b-acceptance-june-event', 'M4B acceptance event',
        'M4B acceptance event', 'Isolated M4B acceptance fixture.',
        'Isolated M4B acceptance fixture.', $2, $3,
        'M4B acceptance venue', 10, true, true, $4, $4)
     ON CONFLICT (id) DO UPDATE SET
       slug = EXCLUDED.slug,
       title_en = EXCLUDED.title_en,
       title_zh = EXCLUDED.title_zh,
       description_en = EXCLUDED.description_en,
       description_zh = EXCLUDED.description_zh,
       starts_at = EXCLUDED.starts_at,
       ends_at = EXCLUDED.ends_at,
       venue = EXCLUDED.venue,
       capacity = EXCLUDED.capacity,
       member_only = EXCLUDED.member_only,
       published = EXCLUDED.published,
       updated_at = EXCLUDED.updated_at`,
    [
      EVENT_ID,
      fixture.eventStart,
      new Date(fixture.eventStart.getTime() + 2 * 60 * 60 * 1_000),
      fixture.createdAt,
    ],
  );

  for (const [index, profile] of fixture.profiles.entries()) {
    await connection.query(
      `INSERT INTO event_registrations
         (event_id, profile_id, status, checked_in_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, profile_id) DO UPDATE SET
         status = EXCLUDED.status,
         checked_in_at = EXCLUDED.checked_in_at`,
      [
        EVENT_ID,
        profile.id,
        index < 3 ? "attended" : "no_show",
        index < 3
          ? new Date(fixture.eventStart.getTime() + 10 * 60 * 1_000)
          : null,
      ],
    );
  }
}

export async function seedM4B(
  pool: M4BSeedPool,
  options: Readonly<{asOf?: Date}> = {},
): Promise<void> {
  const fixture = buildM4BAcceptanceFixture(options.asOf);
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`hkwtia:${M4B_ACCEPTANCE_OWNERSHIP_KEY}`],
    );
    await clearGeneratedEffects(connection, fixture);
    await writeBaseFixture(connection, fixture);
    await writeReportFacts(connection, fixture);
    await connection.query("COMMIT");
  } catch (error) {
    try {
      await connection.query("ROLLBACK");
    } catch {
      // Preserve the fixture reconciliation failure.
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function assertM4BSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment[M4B_ACCEPTANCE_SEED_ENV]?.trim().toLowerCase() !== "true") {
    throw new Error("M4B_ACCEPTANCE_SEED_NOT_AUTHORIZED");
  }
  if (
    environment.VERCEL_ENV?.trim().toLowerCase() === "production"
    || environment.NODE_ENV?.trim().toLowerCase() === "production"
  ) {
    throw new Error("M4B_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("M4B_ACCEPTANCE_DATABASE_URL_REQUIRED");
  }
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) {
    throw new Error("M4B_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
  }
  if (databaseUrl !== testDatabaseUrl) {
    throw new Error("M4B_ACCEPTANCE_DATABASE_URL_MISMATCH");
  }
  return databaseUrl;
}

type SeedPoolWithEnd = M4BSeedPool & Readonly<{
  end: () => Promise<void>;
}>;

export async function runM4BSeed(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  createPool: (databaseUrl: string) => SeedPoolWithEnd =
    (databaseUrl) => new Pool({
      connectionString: databaseUrl,
    }) as unknown as SeedPoolWithEnd,
): Promise<void> {
  const databaseUrl = assertM4BSeedEnvironment(environment);
  const pool = createPool(databaseUrl);
  try {
    await seedM4B(pool);
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint
  && fileURLToPath(import.meta.url).toLowerCase() ===
    entrypoint.toLowerCase()
) {
  runM4BSeed().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`M4B acceptance database seed failed: ${message}`);
    process.exitCode = 1;
  });
}
