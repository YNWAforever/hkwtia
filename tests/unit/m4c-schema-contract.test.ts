import {readFileSync} from "node:fs";
import {resolve} from "node:path";

import {describe, expect, it} from "vitest";

import * as serverSchema from "@/lib/db/server-schema";

describe("M4C AI-Ops materialized-view schema contract", () => {
  it("declares the public scalar-only AI-Ops monthly metrics view and generated migration artifacts", () => {
    const view = (serverSchema as Record<string, unknown>).aiopsMonthlyMetrics;
    expect(view).toBeDefined();

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

    const snapshot = JSON.parse(readFileSync(
      resolve("drizzle/meta/0013_snapshot.json"),
      "utf8",
    )) as {views?: Record<string, unknown>};
    expect(snapshot.views).toHaveProperty("public.aiops_monthly_metrics");

    const journal = JSON.parse(readFileSync(
      resolve("drizzle/meta/_journal.json"),
      "utf8",
    )) as {entries?: Array<{tag?: string}>};
    expect(journal.entries?.at(-1)?.tag).toBe("0013_m4c_aiops_metrics");
  });
});
