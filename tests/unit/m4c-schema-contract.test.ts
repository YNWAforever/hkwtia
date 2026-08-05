import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {getMaterializedViewConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import * as serverSchema from "@/lib/db/server-schema";

const allowedPublicColumns = [
  "month_start",
  "is_partial_month",
  "conversation_count",
  "terminal_conversation_count",
  "resolved_conversation_count",
  "escalated_conversation_count",
  "failed_conversation_count",
  "agent_resolved_rate",
  "escalation_rate",
  "failure_rate",
  "median_first_response_ms",
  "first_response_sample_count",
  "csat_average",
  "csat_response_count",
  "staff_hours_saved",
  "llm_cost_usd",
  "renewal_due_count",
  "renewal_paid_count",
  "renewal_rate",
  "first_year_renewal_due_count",
  "first_year_renewal_paid_count",
  "first_year_renewal_rate",
  "refreshed_at",
].sort();

describe("M4C AI-Ops materialized-view schema contract", () => {
  it("declares exactly the approved scalar-only public columns in Drizzle and generated metadata", () => {
    const view = (serverSchema as Record<string, unknown>).aiopsMonthlyMetrics;
    expect(view).toBeDefined();
    if (!view) return;

    const drizzleColumns = Object.values(
      getMaterializedViewConfig(
        view as Parameters<typeof getMaterializedViewConfig>[0],
      ).selectedFields,
    ).map((field) => (field as {name: string}).name).sort();
    expect(drizzleColumns).toEqual(allowedPublicColumns);

    const snapshot = JSON.parse(readFileSync(
      resolve("drizzle/meta/0013_snapshot.json"),
      "utf8",
    )) as {views?: Record<string, {columns?: Record<string, unknown>}>};
    const snapshotView = snapshot.views?.["public.aiops_monthly_metrics"];
    expect(snapshotView).toBeDefined();
    expect(Object.keys(snapshotView?.columns ?? {}).sort()).toEqual(allowedPublicColumns);
  });

  it("ships a Hong Kong twelve-month migration with concurrent-refresh support", () => {
    const migration = readFileSync(
      resolve("drizzle/0013_m4c_aiops_metrics.sql"),
      "utf8",
    );
    expect(migration).toMatch(/CREATE MATERIALIZED VIEW "aiops_monthly_metrics"/);
    expect(migration).toMatch(
      /CREATE UNIQUE INDEX "aiops_monthly_metrics_month_start_unique"/,
    );
    expect(migration).toContain("Asia/Hong_Kong");
    expect(migration).toContain("generate_series");
    expect(migration).toContain("percentile_disc");
    expect(migration).toContain("renewal_paid");
    expect(migration).toContain("renewal_failed");
    expect(migration).not.toMatch(
      /\b(profile_id|conversation_id|message_id|content|metadata|summary|error_code)\b\s+AS\s+"/i,
    );

    const journal = JSON.parse(readFileSync(
      resolve("drizzle/meta/_journal.json"),
      "utf8",
    )) as {entries?: Array<{tag?: string}>};
    expect(journal.entries?.some((entry) => entry.tag === "0013_m4c_aiops_metrics")).toBe(true);
  });
});
