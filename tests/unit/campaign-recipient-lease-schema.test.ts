import {readFileSync, readdirSync} from "node:fs";

import {describe, expect, it} from "vitest";

const schema = readFileSync("lib/db/schema-core.ts", "utf8");
const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")) as {
  entries: Array<{idx: number; tag: string}>;
};

function generatedMigration(tag: string): Readonly<{name: string; sql: string}> {
  const entry = journal.entries.find((candidate) => candidate.tag === tag);
  if (!entry) {
    throw new Error(`MIGRATION_JOURNAL_TAG_MISSING:${tag}`);
  }
  return {
    name: entry.tag,
    sql: readFileSync(`drizzle/${entry.tag}.sql`, "utf8"),
  };
}

describe("campaign recipient processing leases", () => {
  it("adds only the bounded processing state and fencing metadata required by the runner", () => {
    const enumStart = schema.indexOf('pgEnum("campaign_recipient_status"');
    const enumEnd = schema.indexOf("]);", enumStart);
    const recipientStart = schema.indexOf('pgTable("campaign_recipients"');
    const recipientEnd = schema.indexOf("export const events", recipientStart);
    const recipientSchema = schema.slice(recipientStart, recipientEnd);

    expect(schema.slice(enumStart, enumEnd)).toContain('"processing"');
    expect(recipientSchema).toContain('attemptCount: integer("attempt_count").default(0).notNull()');
    expect(recipientSchema).toContain('claimedAt: timestamp("claimed_at", {withTimezone: true})');
    expect(recipientSchema).toContain('claimExpiresAt: timestamp("claim_expires_at", {withTimezone: true})');
    expect(recipientSchema).toContain('errorCode: text("error_code")');
    expect(recipientSchema).toContain("campaign_recipients_due_idx");
    expect(recipientSchema).not.toContain("message_body");
    expect(recipientSchema).not.toContain("provider_response");
  });

  it("journals a generated additive migration and matching snapshot", () => {
    const migration = generatedMigration("0008_m3_campaign_recipient_leases");
    const snapshotNames = readdirSync("drizzle/meta").filter((name) => /^\d{4}_snapshot\.json$/.test(name));

    expect(
      journal.entries.find(
        (entry) => entry.tag === "0008_m3_campaign_recipient_leases",
      ),
    ).toMatchObject({idx: 8, tag: "0008_m3_campaign_recipient_leases"});
    expect(migration.sql).toMatch(/ALTER TYPE "public"\."campaign_recipient_status" ADD VALUE 'processing'/);
    expect(migration.sql).toContain('ALTER TABLE "campaign_recipients" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL');
    expect(migration.sql).toContain('ALTER TABLE "campaign_recipients" ADD COLUMN "claimed_at" timestamp with time zone');
    expect(migration.sql).toContain('ALTER TABLE "campaign_recipients" ADD COLUMN "claim_expires_at" timestamp with time zone');
    expect(migration.sql).toContain('ALTER TABLE "campaign_recipients" ADD COLUMN "error_code" text');
    expect(migration.sql).toContain('CREATE INDEX "campaign_recipients_due_idx"');
    expect(snapshotNames).toContain("0008_snapshot.json");
  });
});
