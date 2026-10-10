import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {createLeadRemindersRepository} from "@/lib/db/repos/lead-reminders";

/**
 * Final review I5. The Unassigned block goes to every staff, exco and superadmin
 * profile daily, so it must be the leads somebody should pick up NOW — not every
 * unowned contact the WhatsApp, event and import paths have ever created. An open
 * unowned lead is listed when it was created in the last 14 days, or had an
 * activity or a join invite in the last 14 days. Owned leads are unchanged: they
 * appear when they carry a dated step. The clock is fixed, never the wall clock.
 */
const dialect = new PgDialect();
const now = new Date("2026-10-20T02:00:00.000Z");
const fourteenDaysBefore = new Date("2026-10-06T02:00:00.000Z");

function fakeDatabase() {
  const statements: {text: string; params: unknown[]}[] = [];
  return {
    statements,
    database: {
      async execute(query: unknown) {
        const rendered = dialect.sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
        statements.push({text: rendered.sql.replace(/\s+/g, " ").trim().toLowerCase(), params: rendered.params});
        return {rows: []};
      },
      async transaction() { throw new Error("read only"); },
    },
  };
}

describe("leadRemindersRepository.load — the Unassigned window", () => {
  it("limits unowned leads to those created, touched or invited in the last 14 days", async () => {
    const fake = fakeDatabase();
    await createLeadRemindersRepository(async () => fake.database as never).load(automationCronActor(), now);
    const leads = fake.statements.find((statement) => statement.text.includes("c.next_step_due_at") && statement.text.startsWith("select c.id"))!;
    expect(leads.text).toContain("c.owner_profile_id is not null and c.next_step_due_at is not null");
    expect(leads.text).toContain("c.owner_profile_id is null and (c.created_at >=");
    expect(leads.text).toMatch(/exists \(select 1 from "contact_activities" a where a\.contact_id = c\.id and a\.created_at >= \$\d+\)/);
    expect(leads.text).toMatch(/exists \(select 1 from "join_invites" ji where ji\.contact_id = c\.id and ji\.created_at >= \$\d+\)/);
    const cutoffs = leads.params.filter((value): value is Date => value instanceof Date);
    expect(cutoffs).toHaveLength(3);
    expect(cutoffs.every((value) => value.toISOString() === fourteenDaysBefore.toISOString())).toBe(true);
  });

  it("still refuses anything but the cron actor", async () => {
    const fake = fakeDatabase();
    await expect(createLeadRemindersRepository(async () => fake.database as never)
      .load({kind: "system", userId: null, source: "stripe-webhook"} as never, now)).rejects.toThrow();
    expect(fake.statements).toHaveLength(0);
  });
});
