import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./acceptance-guard";
import { createRetentionAnalystRepository } from "../../lib/db/repos/retention-analyst";
import { createApprovalsRepository } from "../../lib/db/repos/approvals";
import { createAgentRunsRepository } from "../../lib/db/repos/agent-runs";
import { automationCronActor } from "../../lib/auth/automation-actor";
import { validateRetentionDraft } from "../../lib/ai/retention-analyst/grounding";
import type { Database } from "../../lib/db/repos/common";
import type { AutomationDatabase } from "../../lib/db/repos/journeys";
const locale = z.enum(["en", "zh-HK"]).parse(process.argv[2]);
const url = assertIsolatedSeedEnvironment(process.env, {
  prefix: "FULL_REMEDIATION",
  flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
  hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
});
assert.equal(url, process.env.DATABASE_URL_TEST);
assert.equal(
  new URL(url).hostname,
  "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
);
const pool = new Pool({ connectionString: url, query_timeout: 15000 });
try {
  await assertSeedSentinel("FULL_REMEDIATION", async () =>
    Number(
      (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
        .rows[0].n,
    ),
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM drizzle.__drizzle_migrations",
        )
      ).rows[0].n,
    ),
    60,
  );
  assert.equal(
    Number(
      (
        await pool.query(
          "SELECT count(*) AS n FROM profiles WHERE email IS NOT NULL AND email NOT LIKE '%example.test'",
        )
      ).rows[0].n,
    ),
    0,
  );
  const profileId = "t11-native-" + randomUUID(),
    membershipId = randomUUID(),
    runId = randomUUID(),
    createdAt = new Date(Date.now() - 86400000),
    renewalAt = new Date(Date.now() + 30 * 86400000);
  await pool.query(
    "INSERT INTO profiles(id,auth_user_id,display_name,email,locale,consent_marketing,created_at) VALUES($1,$1,'Synthetic retention member',$2,$3,true,$4)",
    [profileId, profileId + "@example.test", locale, createdAt],
  );
  await pool.query(
    "INSERT INTO memberships(id,owner_user_id,plan_code,status,seat_limit,billing_period_end,created_at) VALUES($1,$2,'startup','active',1,$3,$4)",
    [membershipId, profileId, renewalAt, createdAt],
  );
  const db = drizzle(pool),
    candidate = await createRetentionAnalystRepository(
      async () => db as unknown as AutomationDatabase,
    ).getCurrentCandidate(automationCronActor(), {
      profileId,
      asOf: new Date(),
    });
  assert(candidate);
  const actor = {
    kind: "agent" as const,
    agent: "retention_analyst" as const,
    runId,
    conversationId: null,
    profileId: null,
    trigger: "scheduled" as const,
  };
  const runs = createAgentRunsRepository(
    async () => db as unknown as AutomationDatabase,
  );
  await runs.start(actor, {
    provider: null,
    model: null,
    startedAt: new Date(),
  });
  // This fixture has never called a model. Record a disabled/not-dispatched runtime, not provider success.
  await runs.disable(actor, {
    completedAt: new Date(),
    summaryCode: "agent_disabled",
    usageState: "not_dispatched",
    costUsd: null,
  });
  const draft = validateRetentionDraft(
    {
      subject: locale === "en" ? "Can we help?" : "需要我們協助嗎？",
      body:
        (locale === "en"
          ? "Please contact our team to discuss your membership."
          : "如需會籍協助，請聯絡團隊。") + "\n{{facts.renewalDate}}",
      reasonCodes: [...candidate.riskCodes],
    },
    candidate,
    new Date(),
  );
  const result = await createApprovalsRepository(
    async () => db as unknown as Database,
  ).createRetentionOutreachOnce(actor, {
    requestKey: "t11-native:" + randomUUID(),
    profileId,
    membershipId,
    locale,
    reasonCodes: candidate.riskCodes,
    subject: draft.subject,
    body: draft.body,
    factsHash: candidate.factsHash,
    planCode: candidate.planCode,
    renewalDate: candidate.renewalDate,
  });
  console.log(
    JSON.stringify({
      ...result,
      profileId,
      membershipId,
      renewalDate: candidate.renewalDate,
      syntheticOfflineFixture: true,
      externalModelCalls: 0,
      production: false,
    }),
  );
} finally {
  await pool.end();
}
