import {readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

// Phase E (lead pipeline) migration 0063 must stay purely additive: no backfill,
// no drops, so it can be applied to production ahead of the code that uses it.
const sql = readFileSync(join(process.cwd(), "drizzle", "0063_lead_pipeline.sql"), "utf8");

describe("migration 0063 lead pipeline", () => {
  it("creates contact_activity_kind with the eight values in order", () => {
    expect(sql).toMatch(
      /CREATE TYPE "public"\."contact_activity_kind" AS ENUM\('note', 'stage_change', 'owner_change', 'next_step', 'invite_sent', 'invite_opened', 'applied', 'became_member'\)/,
    );
  });

  it("creates contact_activities with a cascading contact FK and the feed index", () => {
    const table = sql.match(/CREATE TABLE "contact_activities" \([\s\S]*?\n\);/)?.[0] ?? "";
    expect(table).toContain('"meta" jsonb DEFAULT \'{}\'::jsonb NOT NULL');
    expect(sql).toMatch(
      /ALTER TABLE "contact_activities" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("contact_id"\) REFERENCES "public"\."contacts"\("id"\) ON DELETE cascade/,
    );
    expect(sql).toMatch(
      /ALTER TABLE "contact_activities" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("actor_profile_id"\) REFERENCES "public"\."profiles"\("id"\) ON DELETE set null/,
    );
    expect(sql).toMatch(
      /CREATE INDEX "contact_activities_contact_created_idx" ON "contact_activities" USING btree \("contact_id","created_at" DESC NULLS LAST\)/,
    );
  });

  it("creates join_invites with a unique token digest", () => {
    const table = sql.match(/CREATE TABLE "join_invites" \([\s\S]*?\n\);/)?.[0] ?? "";
    expect(table).toContain('"token_digest" text NOT NULL');
    expect(table).toMatch(/CONSTRAINT "[^"]+" UNIQUE\("token_digest"\)/);
    expect(sql).toMatch(
      /ALTER TABLE "join_invites" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("contact_id"\) REFERENCES "public"\."contacts"\("id"\) ON DELETE cascade/,
    );
  });

  it("adds the contact follow-up columns", () => {
    expect(sql).toContain('ALTER TABLE "contacts" ADD COLUMN "next_step" text');
    expect(sql).toContain('ALTER TABLE "contacts" ADD COLUMN "next_step_due_at" timestamp with time zone');
    expect(sql).toContain('ALTER TABLE "contacts" ADD COLUMN "last_touch_at" timestamp with time zone');
  });

  it("attributes applications to an invite, nulling on invite delete", () => {
    expect(sql).toContain('ALTER TABLE "membership_applications" ADD COLUMN "invite_id" uuid');
    expect(sql).toMatch(
      /ALTER TABLE "membership_applications" ADD CONSTRAINT "[^"]+" FOREIGN KEY \("invite_id"\) REFERENCES "public"\."join_invites"\("id"\) ON DELETE set null/,
    );
  });

  it("is additive: no DROP, no UPDATE, no backfill", () => {
    expect(sql).not.toMatch(/\bDROP\b/i);
    // "ON UPDATE no action" is FK boilerplate; only a statement-leading UPDATE is a backfill.
    expect(sql).not.toMatch(/^\s*UPDATE\b/im);
  });
});
