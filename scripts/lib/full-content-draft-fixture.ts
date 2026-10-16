import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { z } from "zod";
import {
  assertIsolatedSeedEnvironment,
  assertSeedSentinel,
} from "./acceptance-guard";
import { createAiDraftsRepository } from "../../lib/db/repos/ai-drafts";
import { createPostsRepository } from "../../lib/db/repos/posts";
import { createAgentRunsRepository } from "../../lib/db/repos/agent-runs";
import { buildBoardFactPack } from "../../lib/ai/board-reporter/facts";
import { validateBoardNarratives } from "../../lib/ai/board-reporter/grounding";
import {
  renderBoardReportMdx,
  boardReportLabels,
} from "../../lib/ai/board-reporter/render";
import { claimsForGroundedTemplate } from "../../lib/ai/drafts/validation";
import type { KbDatabaseLoader } from "../../lib/db/repos/kb-documents";
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
    61,
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
  const staff = (
    await pool.query(
      "SELECT id,auth_user_id,role FROM profiles WHERE id='m2-staff-01' AND role='staff'",
    )
  ).rows;
  assert.equal(staff.length, 1);
  const admin = {
    kind: "staff" as const,
    profileId: staff[0].id as string,
    userId: staff[0].auth_user_id as string,
  };
  const eventId = randomUUID(),
    newsId = randomUUID(),
    db = drizzle(pool),
    drafts = createAiDraftsRepository((async () => db) as KbDatabaseLoader),
    runs = createAgentRunsRepository(
      async () => db as unknown as AutomationDatabase,
    );
  await pool.query(
    "INSERT INTO events(id,slug,title_en,title_zh,description_en,description_zh,starts_at,ends_at,venue,capacity,registration_mode,ticket_price_hkd_cents) VALUES($1,$2,'Synthetic content event','合成內容活動','Original copy.','原有正文。','2026-10-31T16:30:00Z','2026-10-31T18:30:00Z','Synthetic Hall',50,'ticketed',10000)",
    [eventId, "t12-native-event-" + eventId],
  );
  await pool.query(
    "INSERT INTO posts(id,slug,kind,title_en,title_zh,body_mdx,body_mdx_zh_hk,author) VALUES($1,$2,'news','Synthetic content news','合成內容新聞','Original copy.','原有正文。','Synthetic acceptance')",
    [newsId, "t12-native-news-" + newsId],
  );
  const offlineRun = async () => {
    const actor = {
      kind: "agent" as const,
      agent: "board_reporter" as const,
      runId: randomUUID(),
      profileId: null,
      conversationId: null,
      trigger: "scheduled" as const,
    };
    await runs.start(actor, {
      provider: null,
      model: null,
      startedAt: new Date(),
    });
    await runs.disable(actor, {
      completedAt: new Date(),
      summaryCode: "agent_disabled",
      usageState: "not_dispatched",
      costUsd: null,
    });
    return actor;
  };
  const entries = [];
  for (const [kind, id] of [
    ["event", eventId],
    ["news", newsId],
  ] as const) {
    const caseId = `${kind}:${id}:${locale}`,
      facts = await drafts.getFacts(admin, { kind: "content", caseId }),
      actor = await offlineRun();
    const body =
      (locale === "en" ? "Review source records." : "請檢視來源紀錄。") +
      "\n" +
      Object.keys(facts.values)
        .map((field) => "{{facts." + field + "}}")
        .join("\n");
    const draft = await drafts.saveProposedDraft(admin, {
      kind: "content",
      caseId,
      body,
      claims: claimsForGroundedTemplate(body, facts),
      sourceRefs: [],
      ownerId: admin.profileId,
      dueAt: null,
      modelRoute: "synthetic-offline-no-provider",
      promptVersion: "t12-native-fixture",
      runId: actor.runId,
      expectedFactsHash: facts.versionHash,
    });
    assert.equal(draft.state, "needs_review");
    entries.push({ kind, id, draftId: draft.id, version: draft.version });
  }
  const boardActor = await offlineRun(),
    pack = await buildBoardFactPack(
      boardActor,
      new Date("2026-10-01T02:00:00Z"),
    );
  const narrative = validateBoardNarratives(
    {
      en: {
        executiveSummary: "Review the reporting window.",
        highlights: ["{{facts.mrrHkd}}"],
        risks: [],
        recommendedActions: ["Review source records."],
      },
      zhHK: {
        executiveSummary: "請檢視報告期間。",
        highlights: ["{{facts.mrrHkd}}"],
        risks: [],
        recommendedActions: ["請檢視來源紀錄。"],
      },
    },
    pack,
    new Date(),
  );
  const board = await createPostsRepository(
    async () => db as unknown as Database,
  ).createBoardDraftOnce(boardActor, {
    sourceKey: `board-report:${pack.reportMonth}:synthetic-t12-${randomUUID()}`,
    slug: "t12-native-board-" + randomUUID(),
    titleEn: boardReportLabels("en").title + ": " + pack.reportMonth,
    titleZh: boardReportLabels("zh-HK").title + ": " + pack.reportMonth,
    bodyMdx: renderBoardReportMdx({
      factPack: pack,
      narrative: narrative.en,
      agentRunId: boardActor.runId,
    }),
    bodyMdxZhHk: renderBoardReportMdx({
      factPack: pack,
      narrative: narrative.zhHK,
      agentRunId: boardActor.runId,
      locale: "zh-HK",
    }),
  });
  console.log(
    JSON.stringify({
      locale,
      entries,
      boardId: board.postId,
      syntheticOfflineFixture: true,
      externalModelCalls: 0,
      production: false,
    }),
  );
} finally {
  await pool.end();
}
