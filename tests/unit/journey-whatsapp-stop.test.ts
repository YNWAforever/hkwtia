import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createJobRunnerContextRepository} from "@/lib/db/repos/job-runner-context";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";

/**
 * C-9 review. The journey lane is the SECOND send path `RUN_LIVE_WOZTELL=1`
 * turns on, and until this landed it was the only one that did not read both
 * consent stores: it gated on `profiles.whatsapp_opt_in` alone.
 *
 * The hazard is not hypothetical and not rare. Two profiles sharing one handset
 * is ordinary — a company number, which is the shape most of the M2 fixture's
 * memberships have. When the member on that handset replies STOP,
 * `woztellProfileResolver.resolveProfile` returns null (`matches.length !== 1`),
 * so the webhook never reaches `suppressionsRepository.optOutWhatsApp`: the only
 * thing written is `contacts.whatsapp_opted_out_at`, keyed on the phone. The
 * profile flag stays true and no `message_suppressions` row exists at all —
 * exactly the case `lib/db/repos/message-eligibility.ts` documents on its member
 * anchor — so every later tick of `renewal_14`, `dunning_3` and
 * `event_reminder_24h` went to a handset that had said STOP.
 *
 * These two cases pin the repository half. The runner's refusal is pinned in
 * `tests/unit/journey-runner.test.ts`, and the wiring that carries the fact from
 * one to the other in `tests/unit/job-runner-context-event-reminder.test.ts`.
 */

const profileId = "member-shared-handset";

function journeyRow(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: profileId,
    email: "member@example.test",
    display_name: "Fixture Member",
    locale: "en",
    last_login_at: null,
    consent_marketing: true,
    onboarding_state: "complete",
    whatsapp_opt_in: true,
    whatsapp_number: "+85255550000",
    whatsapp_opted_out_at: null,
    engagement_score: 50,
    membership_status: null,
    billing_period_end: null,
    email_suppressed: false,
    ...overrides,
  };
}

function fakeDatabase(rows: readonly Record<string, unknown>[]): AutomationDatabase {
  const database = {
    execute: async () => ({rows}),
    transaction: async <T,>(work: (tx: AutomationDatabase) => Promise<T>) => work(database),
  } as unknown as AutomationDatabase;
  return database;
}

describe("loadJourney reads both WhatsApp consent stores (C-9)", () => {
  it("joins contacts and projects the recorded withdrawal", async () => {
    const statements: string[] = [];
    const proxy = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });
    const database = {
      execute: (query: Parameters<AutomationDatabase["execute"]>[0]) => proxy.execute(query),
      transaction: async <T,>(work: (tx: AutomationDatabase) => Promise<T>) => work(database),
    } as AutomationDatabase;

    // The row comes back empty, so the loader throws JOB_CONTEXT_NOT_FOUND; the
    // statement is built either way and the statement is what this asserts on.
    await createJobRunnerContextRepository(async () => database)
      .loadJourney(automationCronActor(), profileId, null)
      .catch(() => undefined);

    // An SQL comment is not SQL: the join is explained in prose right above the
    // column, and a keyword scan over raw text would match the prose instead.
    const rendered = statements.join("\n").replace(/--[^\n]*/g, " ");
    expect(rendered).toMatch(/left join\s+"contacts"/i);
    expect(rendered).toMatch(/"contacts"\."profile_id"\s*=\s*"profiles"\."id"/i);
    expect(rendered).toMatch(/"contacts"\."whatsapp_opted_out_at"/i);
  });

  it("reports the withdrawal beside an opt-in flag that is still true", async () => {
    const stoppedAt = new Date("2026-09-11T04:05:06.000Z");
    const record = await createJobRunnerContextRepository(
      async () => fakeDatabase([journeyRow({whatsapp_opted_out_at: stoppedAt})]),
    ).loadJourney(automationCronActor(), profileId, null);

    // Both halves, because either alone is the bug: the flag says "may send"
    // and the timestamp says a person told us to stop.
    expect(record.whatsappOptIn).toBe(true);
    expect(record.whatsappOptedOutAt).toEqual(stoppedAt);
  });

  it("reports null for a member whose linked contact never withdrew", async () => {
    // The positive control. An assertion that only ever sees a withdrawal would
    // pass just as well against a column hard-coded to now().
    const record = await createJobRunnerContextRepository(
      async () => fakeDatabase([journeyRow()]),
    ).loadJourney(automationCronActor(), profileId, null);

    expect(record.whatsappOptedOutAt).toBeNull();
  });
});
