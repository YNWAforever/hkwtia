import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, expectTypeOf, it} from "vitest";

import * as serverSchema from "@/lib/db/server-schema";

import {
  agentRuns,
  auditEvents,
  companies,
  companyMembers,
  contacts,
  conversations,
  jobs,
  membershipApplications,
  membershipPlans,
  messages,
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
    expect(
      (serverSchema as unknown as Record<string, unknown>).posts,
    ).toBeDefined();
  });

  it("retains all required AI concierge foreign-key relations", () => {
    const conversationForeignKeys = getTableConfig(conversations).foreignKeys;
    const messageForeignKeys = getTableConfig(messages).foreignKeys;
    const agentRunForeignKeys = getTableConfig(agentRuns).foreignKeys;

    expect(conversationForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === conversations.profileId
        && reference.foreignTable === profiles
        && reference.foreignColumns[0] === profiles.id;
    })).toBe(true);
    expect(messageForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === messages.conversationId
        && reference.foreignTable === conversations
        && reference.foreignColumns[0] === conversations.id;
    })).toBe(true);
    expect(agentRunForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === agentRuns.conversationId
        && reference.foreignTable === conversations
        && reference.foreignColumns[0] === conversations.id;
    })).toBe(true);
    expect(agentRunForeignKeys.some((foreignKey) => {
      const reference = foreignKey.reference();
      return reference.columns[0] === agentRuns.profileId
        && reference.foreignTable === profiles
        && reference.foreignColumns[0] === profiles.id;
    })).toBe(true);
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

describe("phase A contacts and consent contract", () => {
  it("records WhatsApp consent provenance on profiles", () => {
    expect(profiles.whatsappConsentAt).toBeDefined();
    expect(profiles.whatsappConsentSource).toBeDefined();
    expect(profiles.whatsappConsentTextVersion).toBeDefined();
    expect(profiles.marketingConsentAt).toBeDefined();
  });

  it("defines contacts with one row per phone and one per Woztell member id", () => {
    const config = getTableConfig(contacts);
    expect(config.name).toBe("contacts");
    const indexNames = config.indexes.map((index) => index.config.name);
    expect(indexNames).toContain("contacts_phone_unique");
    expect(indexNames).toContain("contacts_whatsapp_member_unique");
    expect(indexNames).toContain("contacts_profile_unique");
    expect(contacts.source).toBeDefined();
    expect(contacts.stage).toBeDefined();
    expect(contacts.whatsappOptedOutAt).toBeDefined();
  });
});
