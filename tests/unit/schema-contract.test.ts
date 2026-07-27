import {describe, expect, expectTypeOf, it} from "vitest";

import * as serverSchema from "@/lib/db/server-schema";

import {
  auditEvents,
  companies,
  companyMembers,
  jobs,
  membershipApplications,
  membershipPlans,
  memberships,
  profiles,
  seatInvitations,
  staffTasks,
} from "@/lib/db/server-schema";

describe("membership schema contract", () => {
  it("defines all M1 application tables", () => {
    expect(profiles).toBeDefined();
    expect(companies).toBeDefined();
    expect(companyMembers).toBeDefined();
    expect(seatInvitations).toBeDefined();
    expect(membershipPlans).toBeDefined();
    expect(membershipApplications).toBeDefined();
    expect(memberships).toBeDefined();
    expect(jobs).toBeDefined();
    expect(auditEvents).toBeDefined();
  });

  it("defines one unique idempotency key for webhook jobs", () => {
    expect(jobs.runKey).toBeDefined();
  });

  it("exposes company and member columns for scoped uniqueness", () => {
    expect(companyMembers.companyId).toBeDefined();
    expect(companyMembers.userId).toBeDefined();
    expect(memberships.companyId).toBeDefined();
    expect(memberships.ownerUserId).toBeDefined();
    expect(membershipPlans.code).toBeDefined();
  });

  it("exposes the Drizzle tables through the server-only runtime wrapper", () => {
    expect(serverSchema.jobs).toBe(jobs);
  });
});

describe("M4A AI concierge schema contract", () => {
  it("exposes the durable knowledge, conversation, message, and run tables", () => {
    expect(serverSchema.kbDocuments).toBeDefined();
    expect(serverSchema.conversations).toBeDefined();
    expect(serverSchema.messages).toBeDefined();
    expect(serverSchema.agentRuns).toBeDefined();
  });

  it("records message channels and provider identifiers directly on messages", () => {
    expect(serverSchema.messages.channel).toBeDefined();
    expect(serverSchema.messages.providerMessageId).toBeDefined();
    expect(serverSchema.messages.conversationId).toBeDefined();
  });

  it("supports anonymous escalation with bounded staff-task context", () => {
    expect(serverSchema.staffTasks.profileId).toBeDefined();
    expect(serverSchema.staffTasks.context).toBeDefined();
    expectTypeOf<typeof staffTasks.$inferInsert.profileId>().toEqualTypeOf<string | null | undefined>();
    expectTypeOf<typeof staffTasks.$inferSelect.context>().toEqualTypeOf<{
      contactEmail?: string;
      conversationId?: string;
      agentRunId?: string;
      reasonCode?: string;
      locale?: "en" | "zh-HK";
    }>();
  });

  it("keeps run feedback, lifecycle, and transcript retention queryable", () => {
    expect(serverSchema.agentRuns.csatScore).toBeDefined();
    expect(serverSchema.agentRuns.createdAt).toBeDefined();
    expect(serverSchema.conversations.expiresAt).toBeDefined();
  });
});
