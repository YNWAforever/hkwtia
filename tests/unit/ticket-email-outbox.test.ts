import {PgDialect} from "drizzle-orm/pg-core";
import {describe, expect, it, vi} from "vitest";

import {createTicketEmailOutboxRepository} from "@/lib/db/repos/ticket-email-outbox";
import {automationCronActor} from "@/lib/auth/automation-actor";
import type {Database} from "@/lib/db/repos/common";

const id = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-09-26T04:00:00Z");

describe("ticket email outbox", () => {
  it("surfaces a refund still unverified after a day while leaving it retryable", async () => {
    const statements: string[] = [];
    const dialect = new PgDialect();
    const execute = vi.fn(async (query: unknown) => {
      statements.push(dialect.sqlToQuery(query as never).sql);
      return {rows: []};
    });
    const database = {execute, transaction: vi.fn(async (work: (tx: {execute: typeof execute}) => Promise<unknown>) => work({execute}))};
    const repository = createTicketEmailOutboxRepository(async () => database as unknown as Database);

    await repository.claimDue(automationCronActor(), now, 3);
    expect(statements.some((statement) => statement.includes("ticket_refund_provider_pending")
      && statement.includes("first_attempt_at IS NULL")
      && statement.includes("created_at <="))).toBe(true);
    expect(statements.some((statement) => statement.includes("UPDATE ticket_email_outbox AS outbox")
      && statement.includes("status = 'sending'"))).toBe(true);
  });
  it("keeps an unverified refund retryable after many provider checks", async () => {
    const statements: string[] = [];
    const dialect = new PgDialect();
    const execute = vi.fn(async (query: unknown) => {
      const rendered = dialect.sqlToQuery(query as never);
      statements.push(rendered.sql);
      return {rows: [{id}]};
    });
    const database = {execute, transaction: vi.fn(async (work: (tx: {execute: typeof execute}) => Promise<unknown>) => work({execute}))};
    const repository = createTicketEmailOutboxRepository(async () => database as unknown as Database);

    await expect(repository.markRetryable(id, 8, now, "refund_pending")).resolves.toBe(true);
    expect(statements).toHaveLength(1);
    expect(statements[0]).toMatch(/status = 'queued'/);
    expect(statements[0]).not.toMatch(/status = 'blocked'/);
  });
});
