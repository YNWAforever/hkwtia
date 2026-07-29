import {fileURLToPath} from "node:url";

import {Pool} from "pg";

import {M4C_ACCEPTANCE_OWNERSHIP_KEY} from "@/lib/acceptance/m4c-ownership";

export const M4C_ACCEPTANCE_SEED_ENV = "M4C_ACCEPTANCE_SEED";

const PRIVATE_CANARY = "M4C_PRIVATE_CANARY_private@example.test";
const PROFILE_IDS = [
  "m4c-acceptance-renewal-paid",
  "m4c-acceptance-renewal-failed",
] as const;
const MEMBERSHIP_IDS = [
  "50000060-0000-4000-8000-000000000001",
  "50000060-0000-4000-8000-000000000002",
] as const;

type AgentRunFixture = Readonly<{
  id: string;
  conversationId: string | null;
  agent: "concierge" | "retention_analyst" | "board_reporter";
  trigger: "web" | "scheduled";
  status: "running" | "completed" | "escalated";
  costUsd: string;
  csatScore: number | null;
  startedAt: Date;
  completedAt: Date | null;
}>;

function stableUuid(group: number, index: number): string {
  return `500000${String(group).padStart(2, "0")}-0000-4000-8000-${
    String(index + 1).padStart(12, "0")
  }`;
}

function hongKongMonth(asOf: Date): {year: number; month: number} {
  const values = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Hong_Kong",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(asOf).map(({type, value}) => [type, value]),
  );
  return {year: Number(values.year), month: Number(values.month)};
}

function monthWindow(
  year: number,
  month: number,
  offset = 0,
): {monthStart: string; from: Date; to: Date} {
  const localMonth = new Date(Date.UTC(year, month - 1 - offset, 1));
  const nextLocalMonth = new Date(Date.UTC(
    localMonth.getUTCFullYear(),
    localMonth.getUTCMonth() + 1,
    1,
  ));
  const from = new Date(localMonth.getTime() - 8 * 60 * 60 * 1_000);
  const to = new Date(nextLocalMonth.getTime() - 8 * 60 * 60 * 1_000);
  return {
    monthStart: localMonth.toISOString().slice(0, 10),
    from,
    to,
  };
}

export function buildM4CSeedFixture(asOf: Date) {
  if (!Number.isFinite(asOf.getTime())) {
    throw new Error("M4C_ACCEPTANCE_AS_OF_INVALID");
  }
  const {year, month} = hongKongMonth(asOf);
  const current = monthWindow(year, month);
  const conversations = Array.from({length: 15}, (_, index) => {
    const createdAt = new Date(
      current.from.getTime() + (index + 1) * 60 * 60 * 1_000,
    );
    return {
      id: stableUuid(10, index),
      ownerHash:
        `${M4C_ACCEPTANCE_OWNERSHIP_KEY}:anonymous:${String(index + 1)}`,
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 30 * 86_400_000),
    };
  });
  const messages = conversations.flatMap((conversation, index) => {
    const latencyMs = (index + 1) * 100;
    return [
      {
        id: stableUuid(20, index * 2),
        conversationId: conversation.id,
        role: "user" as const,
        channel: "web" as const,
        content: index === 0
          ? `Synthetic acceptance request ${PRIVATE_CANARY}`
          : `Synthetic acceptance request ${index + 1}`,
        createdAt: conversation.createdAt,
      },
      {
        id: stableUuid(20, index * 2 + 1),
        conversationId: conversation.id,
        role: "assistant" as const,
        channel: "web" as const,
        content: `Synthetic acceptance response ${index + 1}`,
        createdAt: new Date(conversation.createdAt.getTime() + latencyMs),
      },
    ];
  });
  let runIndex = 0;
  const agentRuns: AgentRunFixture[] = conversations.flatMap(
    (conversation, conversationIndex) => {
      const count = conversationIndex < 8 ? 3 : 2;
      return Array.from({length: count}, (_, localIndex): AgentRunFixture => {
        const isLatest = localIndex === count - 1;
        const index = runIndex++;
        const status = isLatest
          ? conversationIndex < 12 ? "completed" : "escalated"
          : "running";
        const startedAt = new Date(
          conversation.createdAt.getTime() + localIndex * 10,
        );
        return {
          id: stableUuid(30, index),
          conversationId: conversation.id,
          agent: "concierge",
          trigger: "web",
          status,
          costUsd: "0.001500",
          csatScore: isLatest && conversationIndex < 10
            ? conversationIndex < 5 ? 5 : 4
            : null,
          startedAt,
          completedAt: isLatest
            ? new Date(startedAt.getTime() + 50)
            : null,
        };
      });
    },
  );
  agentRuns.push(
    {
      id: stableUuid(30, 38),
      conversationId: null,
      agent: "retention_analyst",
      trigger: "scheduled",
      status: "completed",
      costUsd: "0.005500",
      csatScore: null,
      startedAt: new Date(current.from.getTime() + 20 * 60 * 60 * 1_000),
      completedAt: new Date(current.from.getTime() + 20 * 60 * 60 * 1_000 + 50),
    },
    {
      id: stableUuid(30, 39),
      conversationId: null,
      agent: "board_reporter",
      trigger: "scheduled",
      status: "completed",
      costUsd: "0.005500",
      csatScore: null,
      startedAt: new Date(current.from.getTime() + 21 * 60 * 60 * 1_000),
      completedAt: new Date(current.from.getTime() + 21 * 60 * 60 * 1_000 + 50),
    },
  );
  const renewalFacts = Array.from({length: 12}, (_, reverseIndex) => {
    const window = monthWindow(year, month, 11 - reverseIndex);
    const occurredAt = new Date(window.from.getTime() + 12 * 60 * 60 * 1_000);
    return {
      monthStart: window.monthStart,
      events: [
        {
          id: stableUuid(40, reverseIndex * 2),
          profileId: PROFILE_IDS[0],
          membershipId: MEMBERSHIP_IDS[0],
          type: "renewal_paid" as const,
          renewalOrdinal: 1,
          occurredAt,
        },
        {
          id: stableUuid(40, reverseIndex * 2 + 1),
          profileId: PROFILE_IDS[1],
          membershipId: MEMBERSHIP_IDS[1],
          type: "renewal_failed" as const,
          renewalOrdinal: 2,
          occurredAt: new Date(occurredAt.getTime() + 1),
        },
      ],
    };
  });
  const expectedRenewalMetrics = renewalFacts.map(({monthStart}) => ({
    monthStart,
    renewalDueCount: 2,
    renewalPaidCount: 1,
    renewalRate: 0.5,
    firstYearRenewalDueCount: 1,
    firstYearRenewalPaidCount: 1,
    firstYearRenewalRate: 1,
  }));
  const publishedAt = new Date(asOf.getTime() - 86_400_000);
  const buildLogs = [
    {
      id: stableUuid(50, 0),
      slug: "m4-runtime-and-concierge",
      sourceKey: `${M4C_ACCEPTANCE_OWNERSHIP_KEY}:buildlog:runtime`,
      titleEn: "M4 runtime and Concierge",
      titleZh: "M4 執行系統與 Concierge",
      bodyEn: "## What we built\n\nA provider-neutral runtime with guarded tools.",
      bodyZhHk: "## 我們建構了甚麼\n\n一套供應商中立並設有工具防護的執行系統。",
      publishedAt,
    },
    {
      id: stableUuid(50, 1),
      slug: "m4-public-ai-ops",
      sourceKey: `${M4C_ACCEPTANCE_OWNERSHIP_KEY}:buildlog:aiops`,
      titleEn: "M4 public AI-Ops",
      titleZh: "M4 公開 AI-Ops",
      bodyEn: "## What we built\n\nA privacy-safe aggregate operations dashboard.",
      bodyZhHk: "## 我們建構了甚麼\n\n一個保障私隱的綜合營運儀表板。",
      publishedAt,
    },
  ] as const;
  return {
    asOf: new Date(asOf),
    ownershipKey: M4C_ACCEPTANCE_OWNERSHIP_KEY,
    profiles: PROFILE_IDS.map((id, index) => ({
      id,
      membershipId: MEMBERSHIP_IDS[index]!,
    })),
    conversations,
    messages,
    agentRuns,
    latestOutcomes: agentRuns.filter(({agent, completedAt}) =>
      agent === "concierge" && completedAt !== null
    ).map(({status}) => ({status})),
    renewalFacts,
    expectedRenewalMetrics,
    buildLogs,
    expectedCurrentMetrics: {
      conversationCount: 15,
      terminalConversationCount: 15,
      resolvedConversationCount: 12,
      escalatedConversationCount: 3,
      failedConversationCount: 0,
      agentResolvedRate: 0.8,
      escalationRate: 0.2,
      failureRate: 0,
      medianFirstResponseMs: 800,
      firstResponseSampleCount: 15,
      csatAverage: 4.5,
      csatResponseCount: 10,
      staffHoursSaved: 1.2,
      llmCostUsd: 0.068,
    },
  } as const;
}

export type M4CSeedFixture = ReturnType<typeof buildM4CSeedFixture>;

type SeedConnection = Readonly<{
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<unknown>;
  release: () => void;
}>;

export type M4CSeedPool = Readonly<{
  connect: () => Promise<SeedConnection>;
}>;

function rowsFrom(result: unknown): readonly Record<string, unknown>[] {
  if (
    typeof result !== "object" || result === null || !("rows" in result)
    || !Array.isArray(result.rows)
  ) {
    return [];
  }
  return result.rows as readonly Record<string, unknown>[];
}

async function deleteOwnedRows(
  connection: SeedConnection,
  fixture: M4CSeedFixture,
): Promise<void> {
  await connection.query(
    "DELETE FROM posts WHERE source_key = ANY($1::text[])",
    [fixture.buildLogs.map(({sourceKey}) => sourceKey)],
  );
  await connection.query(
    "DELETE FROM engagement_events WHERE id = ANY($1::uuid[])",
    [fixture.renewalFacts.flatMap(({events}) => events.map(({id}) => id))],
  );
  await connection.query(
    "DELETE FROM agent_runs WHERE id = ANY($1::uuid[])",
    [fixture.agentRuns.filter(({conversationId}) =>
      conversationId === null
    ).map(({id}) => id)],
  );
  await connection.query(
    "DELETE FROM conversations WHERE id = ANY($1::uuid[])",
    [fixture.conversations.map(({id}) => id)],
  );
}

async function writeStartupPlan(
  connection: SeedConnection,
  fixture: M4CSeedFixture,
): Promise<void> {
  await connection.query(
    `INSERT INTO membership_plans
       (code, audience, billing_behavior, stripe_price_reference,
        annual_price_hkd, monthly_price_hkd, seat_allowance, active,
        created_at, updated_at)
     VALUES ('startup', 'startup', 'checkout', NULL, 2400, 250, 5, true,
       $1, $1)
     ON CONFLICT (code) DO NOTHING`,
    [fixture.asOf],
  );
}

async function writeRenewalOwners(
  connection: SeedConnection,
  fixture: M4CSeedFixture,
): Promise<void> {
  for (const [index, profile] of fixture.profiles.entries()) {
    await connection.query(
      `INSERT INTO profiles
         (id, auth_user_id, email, role, last_login_at, consent_marketing,
          interests, display_name, phone, job_title, locale,
          onboarding_state, directory_visible, created_at, updated_at,
          whatsapp_opt_in, whatsapp_number)
       VALUES ($1, $2, $3, 'member', $4, false, $5, $6, NULL,
         'M4C acceptance fixture', 'en', 'complete', false, $4, $4,
         false, NULL)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         interests = EXCLUDED.interests,
         display_name = EXCLUDED.display_name,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.id,
        `m4c-acceptance-auth-${index + 1}`,
        `${profile.id}@example.test`,
        fixture.asOf,
        [fixture.ownershipKey],
        `M4C renewal fixture ${index + 1}`,
      ],
    );
    await connection.query(
      `INSERT INTO memberships
         (id, owner_user_id, company_id, application_id, plan_code, status,
          billing_interval, seat_limit, stripe_customer_id,
          stripe_subscription_id, billing_period_start, billing_period_end,
          cancel_at_period_end, created_at, updated_at)
       VALUES ($1, $2, NULL, NULL, 'startup', 'active', 'annual', 5,
         NULL, NULL, $3, $4, false, $3, $3)
       ON CONFLICT (id) DO UPDATE SET
         owner_user_id = EXCLUDED.owner_user_id,
         plan_code = EXCLUDED.plan_code,
         status = EXCLUDED.status,
         billing_interval = EXCLUDED.billing_interval,
         billing_period_start = EXCLUDED.billing_period_start,
         billing_period_end = EXCLUDED.billing_period_end,
         updated_at = EXCLUDED.updated_at`,
      [
        profile.membershipId,
        profile.id,
        fixture.renewalFacts[0]?.events[0]?.occurredAt ?? fixture.asOf,
        fixture.asOf,
      ],
    );
  }
}

async function writeOperationalRows(
  connection: SeedConnection,
  fixture: M4CSeedFixture,
): Promise<void> {
  for (const conversation of fixture.conversations) {
    const lastMessage = fixture.messages.filter(({conversationId}) =>
      conversationId === conversation.id
    ).at(-1);
    await connection.query(
      `INSERT INTO conversations
         (id, profile_id, anonymous_owner_hash, locale, status, agent_kind,
          last_message_at, expires_at, created_at, updated_at)
       VALUES ($1, NULL, $2, 'en', 'closed', 'concierge', $3, $4, $5, $3)`,
      [
        conversation.id,
        conversation.ownerHash,
        lastMessage?.createdAt ?? conversation.createdAt,
        conversation.expiresAt,
        conversation.createdAt,
      ],
    );
  }
  for (const message of fixture.messages) {
    await connection.query(
      `INSERT INTO messages
         (id, conversation_id, role, channel, content, provider_message_id,
          metadata, citations, created_at)
       VALUES ($1, $2, $3, $4, $5, NULL, $6::jsonb, '[]'::jsonb, $7)`,
      [
        message.id,
        message.conversationId,
        message.role,
        message.channel,
        message.content,
        JSON.stringify({fixture: fixture.ownershipKey}),
        message.createdAt,
      ],
    );
  }
  for (const run of fixture.agentRuns) {
    await connection.query(
      `INSERT INTO agent_runs
         (id, conversation_id, profile_id, trigger, status, provider, model,
          input_tokens, output_tokens, cost_usd, latency_ms, summary,
          error_code, csat_score, started_at, completed_at, created_at,
          updated_at, agent)
       VALUES ($1, $2, NULL, $3, $4, 'fixture', 'deterministic', 0, 0,
         $5, 0, $6, NULL, $7, $8, $9, $8, COALESCE($9, $8), $10)`,
      [
        run.id,
        run.conversationId,
        run.trigger,
        run.status,
        run.costUsd,
        `${fixture.ownershipKey}:agent-run`,
        run.csatScore,
        run.startedAt,
        run.completedAt,
        run.agent,
      ],
    );
  }
}

async function writeRenewalFactsAndBuildLogs(
  connection: SeedConnection,
  fixture: M4CSeedFixture,
): Promise<void> {
  for (const event of fixture.renewalFacts.flatMap(({events}) => events)) {
    await connection.query(
      `INSERT INTO engagement_events
         (id, profile_id, company_id, type, points, metadata, occurred_at)
       VALUES ($1, $2, NULL, $3, $4, $5::jsonb, $6)`,
      [
        event.id,
        event.profileId,
        event.type,
        event.type === "renewal_paid" ? 10 : -10,
        JSON.stringify({
          fixture: fixture.ownershipKey,
          membershipId: event.membershipId,
          renewalOrdinal: event.renewalOrdinal,
        }),
        event.occurredAt,
      ],
    );
  }
  for (const buildLog of fixture.buildLogs) {
    await connection.query(
      `INSERT INTO posts
         (id, slug, kind, title_en, title_zh, body_mdx, published_at,
          author, source_key, agent_run_id, created_at, updated_at)
       VALUES ($1, $2, 'buildlog', $3, $4, $5, $6,
         'WTIA Engineering', $7, NULL, $6, $6)`,
      [
        buildLog.id,
        buildLog.slug,
        buildLog.titleEn,
        buildLog.titleZh,
        `${buildLog.bodyEn}\n\n${buildLog.bodyZhHk}`,
        buildLog.publishedAt,
        buildLog.sourceKey,
      ],
    );
  }
}

async function verifyOwnedCounts(
  connection: SeedConnection,
  fixture: M4CSeedFixture,
): Promise<void> {
  const result = await connection.query(
    `SELECT
       (SELECT count(*)::integer FROM conversations
        WHERE id = ANY($1::uuid[])) AS conversation_count,
       (SELECT count(*)::integer FROM agent_runs
        WHERE id = ANY($2::uuid[])) AS run_count,
       (SELECT count(*)::integer FROM posts
        WHERE source_key = ANY($3::text[])) AS post_count`,
    [
      fixture.conversations.map(({id}) => id),
      fixture.agentRuns.map(({id}) => id),
      fixture.buildLogs.map(({sourceKey}) => sourceKey),
    ],
  );
  const row = rowsFrom(result)[0];
  if (
    Number(row?.conversation_count) !== 15
    || Number(row?.run_count) !== 40
    || Number(row?.post_count) !== 2
  ) {
    throw new Error("M4C_ACCEPTANCE_OWNED_COUNT_MISMATCH");
  }
}

export async function seedM4C(
  pool: M4CSeedPool,
  options: Readonly<{asOf: Date}>,
): Promise<void> {
  const fixture = buildM4CSeedFixture(options.asOf);
  const connection = await pool.connect();
  let committed = false;
  try {
    await connection.query("BEGIN");
    await connection.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [`hkwtia:${M4C_ACCEPTANCE_OWNERSHIP_KEY}`],
    );
    await deleteOwnedRows(connection, fixture);
    await writeStartupPlan(connection, fixture);
    await writeRenewalOwners(connection, fixture);
    await writeOperationalRows(connection, fixture);
    await writeRenewalFactsAndBuildLogs(connection, fixture);
    await verifyOwnedCounts(connection, fixture);
    await connection.query("COMMIT");
    committed = true;
    await connection.query(
      "REFRESH MATERIALIZED VIEW CONCURRENTLY aiops_monthly_metrics",
    );
  } catch (error) {
    if (!committed) {
      try {
        await connection.query("ROLLBACK");
      } catch {
        // Preserve the reconciliation failure.
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

export function assertM4CSeedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): string {
  if (environment[M4C_ACCEPTANCE_SEED_ENV]?.trim().toLowerCase() !== "true") {
    throw new Error("M4C_ACCEPTANCE_SEED_NOT_AUTHORIZED");
  }
  if (
    environment.VERCEL_ENV?.trim().toLowerCase() === "production"
    || environment.NODE_ENV?.trim().toLowerCase() === "production"
  ) {
    throw new Error("M4C_ACCEPTANCE_PRODUCTION_FORBIDDEN");
  }
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("M4C_ACCEPTANCE_DATABASE_URL_REQUIRED");
  }
  const testDatabaseUrl = environment.DATABASE_URL_TEST?.trim();
  if (!testDatabaseUrl) {
    throw new Error("M4C_ACCEPTANCE_DATABASE_URL_TEST_REQUIRED");
  }
  if (databaseUrl !== testDatabaseUrl) {
    throw new Error("M4C_ACCEPTANCE_DATABASE_URL_MISMATCH");
  }
  return databaseUrl;
}

type SeedPoolWithEnd = M4CSeedPool & Readonly<{
  end: () => Promise<void>;
}>;

export async function runM4CSeed(
  environment: Readonly<Record<string, string | undefined>> = process.env,
  createPool: (databaseUrl: string) => SeedPoolWithEnd =
    (databaseUrl) => new Pool({
      connectionString: databaseUrl,
    }) as unknown as SeedPoolWithEnd,
): Promise<void> {
  const databaseUrl = assertM4CSeedEnvironment(environment);
  const pool = createPool(databaseUrl);
  try {
    await seedM4C(pool, {asOf: new Date()});
  } finally {
    await pool.end();
  }
}

const entrypoint = process.argv[1];
if (
  entrypoint
  && fileURLToPath(import.meta.url).toLowerCase() === entrypoint.toLowerCase()
) {
  runM4CSeed().catch((error: unknown) => {
    const code = error instanceof Error ? error.message : "UNKNOWN_ERROR";
    console.error(`M4C acceptance database seed failed: ${code}`);
    process.exitCode = 1;
  });
}
