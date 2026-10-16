import "server-only";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./lib/acceptance-guard";
import { aiDraftsRepository } from "../lib/db/repos/ai-drafts";
const deployment = JSON.parse(
    readFileSync(
      ".playwright/full-fix-t09-preview-deployment-safe.json",
      "utf8",
    ),
  ),
  runtime = JSON.parse(
    readFileSync(".playwright/full-fix-t09-preview-runtime-safe.json", "utf8"),
  ),
  binding = JSON.parse(
    readFileSync(".playwright/full-fix-t09-staff-binding-private.json", "utf8"),
  );
assert.equal(deployment.sourceSha, runtime.sourceSha);
assert.equal(deployment.sourceSha, binding.sourceSha);
assert.equal(deployment.target, null);
assert.equal(
  deployment.origin,
  "https://hkwtia-application-triage-20261003.vercel.app",
);
assert.equal(binding.origin, deployment.origin);
assert(
  runtime.checks.some(
    (check: { dbSourcePositivelyProven?: boolean }) =>
      check.dbSourcePositivelyProven,
  ),
);
const url = assertIsolatedSeedEnvironment(process.env, {
  prefix: "FULL_REMEDIATION",
  flag: "FULL_REMEDIATION_ACCEPTANCE_SEED",
  hostAllowlistVar: "FULL_REMEDIATION_DATABASE_HOST_ALLOWLIST",
});
assert.equal(
  new URL(url).hostname,
  "ep-plain-mouse-azm8pl2j-pooler.c-3.ap-southeast-1.aws.neon.tech",
);
assert.equal(process.env.DATABASE_URL, url);
assert.equal(process.env.NEON_PROJECT_ID, "solitary-wave-52860119");
const pool = new Pool({ connectionString: url, query_timeout: 15000 }),
  actor = {
    kind: "staff" as const,
    profileId: binding.profileId,
    userId: binding.userId,
  },
  run = randomUUID(),
  cases = [];
try {
  await assertSeedSentinel("FULL_REMEDIATION", async () =>
    Number(
      (await pool.query("SELECT count(*) AS n FROM acceptance_sentinel"))
        .rows[0].n,
    ),
  );
  const role = (
    await pool.query(
      "SELECT role FROM profiles WHERE id=$1 AND auth_user_id=$2",
      [actor.profileId, actor.userId],
    )
  ).rows;
  assert.equal(role.length, 1);
  assert.equal(role[0].role, "staff");
  for (const locale of ["en", "zh-HK"] as const)
    for (const mode of [
      "manual",
      "payment",
      "review",
      "editReject",
      "stale",
      "adopt",
    ]) {
      const applicationId = randomUUID(),
        profileId = "t09-native-" + randomUUID(),
        companyId = randomUUID(),
        runId = randomUUID(),
        name = "Synthetic T09 " + run + " " + locale + " " + mode,
        plan = mode === "manual" || mode === "payment" ? "corporate" : "patron",
        status =
          mode === "payment"
            ? "pending_payment"
            : mode === "review"
              ? "pending_review"
              : "draft";
      await pool.query(
        "INSERT INTO profiles(id,auth_user_id,email,display_name,role,locale) VALUES($1,$1,$2,$3,'member',$4)",
        [profileId, profileId + "@example.test", name, locale],
      );
      if (plan === "corporate")
        await pool.query(
          "INSERT INTO companies(id,legal_name,display_name,directory_visible) VALUES($1,$2,$2,false)",
          [companyId, mode === "manual" ? "" : "Synthetic T09 Company"],
        );
      await pool.query(
        "INSERT INTO membership_applications(id,applicant_user_id,company_id,plan_code,status) VALUES($1,$2,$3,$4,$5)",
        [
          applicationId,
          profileId,
          plan === "corporate" ? companyId : null,
          plan,
          status,
        ],
      );
      if (mode === "payment") {
        const membershipId = randomUUID();
        await pool.query(
          "INSERT INTO memberships(id,company_id,application_id,plan_code,status,seat_limit) VALUES($1,$2,$3,'corporate','pending_payment',25)",
          [membershipId, companyId, applicationId],
        );
        await pool.query(
          "INSERT INTO billing_attempts(membership_id,attempt_number,idempotency_key,price_reference,state) VALUES($1,1,$2,'synthetic-no-checkout','completed')",
          [membershipId, "t09-native:" + runId],
        );
      }
      let draftId: string | null = null;
      if (["editReject", "stale", "adopt"].includes(mode)) {
        const facts = await aiDraftsRepository.getFacts(actor, {
          kind: "application",
          caseId: applicationId,
        });
        await pool.query(
          "INSERT INTO agent_runs(id,agent,trigger,profile_id,status,provider,model,usage_state,cost_usd,cost_microusd) VALUES($1,'board_reporter','scheduled',$2,'completed','synthetic-fixture','no-provider','legacy_unknown',NULL,NULL)",
          [runId, actor.profileId],
        );
        const draft = await aiDraftsRepository.saveProposedDraft(actor, {
          kind: "application",
          caseId: applicationId,
          body: "{{facts.applicationState}}",
          claims: [
            {
              field: "applicationState",
              value: facts.values.applicationState.value,
              sourceId: facts.values.applicationState.sourceId,
            },
          ],
          sourceRefs: [],
          ownerId: actor.profileId,
          dueAt: null,
          modelRoute: "synthetic-fixture-none",
          promptVersion: "t09-native-no-provider-v1",
          runId,
        });
        assert.equal(draft.state, "needs_review");
        draftId = draft.id;
      }
      cases.push({
        locale,
        mode,
        applicationId,
        profileId,
        companyId: plan === "corporate" ? companyId : null,
        draftId,
        name,
        status,
      });
    }
  writeFileSync(
    ".playwright/full-fix-t09-fixtures-private.json",
    JSON.stringify({
      sourceSha: deployment.sourceSha,
      origin: deployment.origin,
      run,
      cases,
    }),
    { mode: 0o600 },
  );
  writeFileSync(
    ".playwright/full-fix-t09-fixtures-safe.json",
    JSON.stringify(
      {
        sourceSha: deployment.sourceSha,
        origin: deployment.origin,
        observedAt: new Date().toISOString(),
        cases: cases.length,
        drafts: cases.filter((c) => c.draftId).length,
        ledger: 59,
        currentRoleFromTrustedAuthUserId: true,
        isolatedRuntimePositivelyProven: true,
        modelProvider: "none-synthetic-fixture",
        realProviderRequests: 0,
        production: false,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      syntheticCases: cases.length,
      realProviderRequests: 0,
      production: false,
    }),
  );
} catch {
  console.error("T09_ISOLATED_FIXTURE_FAILED");
  process.exitCode = 1;
} finally {
  await pool.end();
  process.exit(process.exitCode ?? 0);
}
