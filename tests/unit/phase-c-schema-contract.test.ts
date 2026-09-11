import {readFileSync} from "node:fs";

import {getTableConfig} from "drizzle-orm/pg-core";
import {describe, expect, it} from "vitest";

import {WHATSAPP_TEMPLATES} from "@/config/whatsapp-templates";
import {
  campaignRecipients,
  campaignStatusEnum,
  campaigns,
  conversationHandlingEnum,
  conversations,
  emailLog,
  messageDeliveryStatusEnum,
  messageDirectionEnum,
  messageRoleEnum,
  messages,
  whatsappLog,
  whatsappTemplates,
} from "@/lib/db/schema-core";
import {derivedConversationChannel} from "@/tests/fixtures/conversation-channel";
import {derivedMessageDirection} from "@/tests/fixtures/message-direction";
import {whatsappTemplateSeedRows} from "@/tests/fixtures/whatsapp-template-seed";

describe("phase C1 conversation operations contract", () => {
  it("gives a conversation a channel, a handling state and a staff assignment", () => {
    for (const column of [
      "channel",
      "handling",
      "contactId",
      "assignedToProfileId",
      "whatsappMemberId",
      "lastInboundAt",
      "lastStaffReadAt",
      "subject",
    ] as const) {
      expect(conversations[column]).toBeDefined();
    }
    expect(conversationHandlingEnum.enumValues).toEqual(["bot", "human", "closed"]);
    expect(conversations.handling.notNull).toBe(true);
    expect(conversations.channel.notNull).toBe(true);
  });

  it("leaves the two-armed owner check alone (D-6: the HMAC stays the owner key)", () => {
    const names = getTableConfig(conversations).checks.map((check) => check.name);
    expect(names).toContain("conversations_owner_check");
    expect(names).not.toContain("conversations_contact_owner_check");
  });

  it("gives a message a direction, a delivery status and a staff sender", () => {
    for (const column of [
      "direction",
      "deliveryStatus",
      "sentByProfileId",
      "templateKey",
      "errorCode",
      "deliveredAt",
      "readAt",
      "outboundKey",
      "sendClaimExpiresAt",
    ] as const) {
      expect(messages[column]).toBeDefined();
    }
    expect(messageDirectionEnum.enumValues).toEqual(["inbound", "outbound"]);
    expect(messageDeliveryStatusEnum.enumValues).toEqual(["queued", "sent", "delivered", "read", "failed"]);
    expect(messages.direction.notNull).toBe(true);
    expect(messages.deliveryStatus.notNull).toBe(false);
  });

  it("appends 'staff' to message_role without disturbing the existing values", () => {
    expect(messageRoleEnum.enumValues).toEqual(["user", "assistant", "tool", "staff"]);
  });

  it("indexes the write-ahead key partially, because a queued row has no provider id yet", () => {
    const names = getTableConfig(messages).indexes.map((index) => index.config.name);
    expect(names).toContain("messages_outbound_key_unique");
    expect(names).toContain("messages_provider_message_id_unique");
  });

  it("derives direction the way migration 0032 does", () => {
    expect(derivedMessageDirection({role: "user"})).toBe("inbound");
    for (const role of ["assistant", "tool"] as const) expect(derivedMessageDirection({role})).toBe("outbound");
  });

  it("calls a conversation WhatsApp when any of its messages is, not only the newest", () => {
    const t = (iso: string) => new Date(iso);
    expect(derivedConversationChannel([])).toBe("web");
    expect(derivedConversationChannel([{channel: "web", createdAt: t("2026-01-01T00:00:00Z")}])).toBe("web");
    // The row class this changes: a WhatsApp thread whose newest message is a
    // web reply. The old latest-message derivation in lib/db/repos/inbox.ts
    // called it "web", and the send path would then believe it may not use the
    // WhatsApp adapter for a thread that plainly is one.
    expect(derivedConversationChannel([
      {channel: "whatsapp", createdAt: t("2026-01-01T00:00:00Z")},
      {channel: "web", createdAt: t("2026-01-02T00:00:00Z")},
    ])).toBe("whatsapp");
  });
});

describe("phase C2 campaign schema contract", () => {
  it("adds the campaign channel, template key, reviewer triple and schedule", () => {
    for (const column of [
      "name",
      "channel",
      "templateKey",
      "variablesTemplate",
      "scheduledAt",
      "reviewedAt",
      "reviewedByProfileId",
      "rejectionReason",
      "completedAt",
      "updatedAt",
    ] as const) {
      expect(campaigns[column]).toBeDefined();
    }
    expect(campaigns.template.notNull).toBe(false);
    const checks = getTableConfig(campaigns).checks.map((check) => check.name);
    expect(checks).toEqual(expect.arrayContaining([
      "campaigns_channel_check",
      "campaigns_email_template_check",
      "campaigns_whatsapp_template_check",
    ]));
  });

  it("lets a recipient be a contact and keeps de-duplication per identity", () => {
    expect(campaignRecipients.profileId.notNull).toBe(false);
    expect(campaignRecipients.email.notNull).toBe(false);
    for (const column of [
      "contactId",
      "whatsappNumber",
      "providerMessageId",
      "sentAt",
      "deliveredAt",
      "readAt",
      "blockedReason",
      "createdAt",
      "updatedAt",
    ] as const) {
      expect(campaignRecipients[column]).toBeDefined();
    }
    const config = getTableConfig(campaignRecipients);
    const indexes = config.indexes.map((index) => index.config.name);
    // NOTE the `_idx` suffixes: the new partial unique indexes deliberately do
    // NOT reuse the dropped constraint's name. See Task 1 Step 4.
    expect(indexes).toEqual(expect.arrayContaining([
      "campaign_recipients_campaign_profile_idx",
      "campaign_recipients_campaign_contact_idx",
      "campaign_recipients_campaign_status_idx",
      "campaign_recipients_provider_message_idx",
    ]));
    expect(config.uniqueConstraints.map((unique) => unique.name))
      .not.toContain("campaign_recipients_campaign_profile_unique");
    expect(config.checks.map((check) => check.name)).toContain("campaign_recipients_identity_check");
  });

  it("can log a delivery to a prospect on either channel", () => {
    expect(emailLog.contactId).toBeDefined();
    expect(whatsappLog.contactId).toBeDefined();
  });

  it("keeps every campaign_status value and appends the five Phase C states at the end", () => {
    expect(campaignStatusEnum.enumValues).toEqual([
      "queued", "processing", "completed", "cancelled",
      "draft", "review", "scheduled", "sending", "failed",
    ]);
  });

  // S-2. One `db:migrate` run is one Postgres transaction, and a value added by
  // ALTER TYPE cannot be USED in it. 0008 is the precedent that got this right
  // by accident; this assertion makes it deliberate. It is the only check in
  // either Phase C plan that catches a failure mode nobody can reproduce
  // locally: `unsafe use of new value … of enum type`, on a fresh database,
  // aborting the whole deploy.
  //
  // Both filters are load-bearing. `ALTER TYPE … ADD VALUE` is the statement we
  // are permitting. `CREATE TYPE … AS ENUM` must go too, because C1's 0031
  // declares message_delivery_status as ('queued','sent','delivered','read',
  // 'failed') — so 0031 legally contains the literal 'failed', belonging to a
  // type CREATEd in the same transaction, which Postgres allows precisely
  // because it was created there. A guard that goes red against correct SQL in
  // a file this plan did not write gets relaxed, and relaxing THIS guard is how
  // the deploy breaks.
  const stripPermittedEnumStatements = (sql: string) =>
    sql.split("\n")
      .filter((line) => !/ALTER TYPE .*ADD VALUE/i.test(line))
      .filter((line) => !/CREATE TYPE .* AS ENUM/i.test(line))
      .join("\n");

  it("never uses a newly added campaign_status value in Phase C DDL", () => {
    for (const file of [
      "drizzle/0031_phase_c_conversation_operations.sql",
      "drizzle/0032_phase_c_message_direction_backfill.sql",
      "drizzle/0033_phase_c_campaign_channels.sql",
      "drizzle/0034_phase_c_whatsapp_template_seed.sql",
    ]) {
      const uses = stripPermittedEnumStatements(readFileSync(file, "utf8"));
      for (const value of ["draft", "review", "scheduled", "sending", "failed"]) {
        expect(uses, file).not.toContain(`'${value}'`);
      }
    }
  });

  // A guard nobody has seen fail is a guard nobody trusts. This is the shape
  // tests/unit/server-action-actor-boundary.test.ts established.
  it("detects the shapes it is meant to catch", () => {
    const hostile = [
      `ALTER TABLE "campaigns" ALTER COLUMN "status" SET DEFAULT 'draft';`,
      `UPDATE "campaigns" SET "status" = 'review' WHERE "reviewed_at" IS NOT NULL;`,
      `ALTER TABLE "campaigns" ADD CONSTRAINT "c" CHECK ("status" <> 'scheduled');`,
    ].join("\n");
    const uses = stripPermittedEnumStatements(hostile);
    for (const value of ["draft", "review", "scheduled"]) {
      expect(uses).toContain(`'${value}'`);
    }
    // …and that the two permitted forms really are stripped:
    expect(stripPermittedEnumStatements(
      `ALTER TYPE "public"."campaign_status" ADD VALUE 'draft';\n`
      + `CREATE TYPE "public"."message_delivery_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');`,
    ).trim()).toBe("");
  });

  it("registers the template registry and seeds it pending, from the config", () => {
    const config = getTableConfig(whatsappTemplates);
    expect(config.checks.map((check) => check.name)).toEqual(expect.arrayContaining([
      "whatsapp_templates_status_check",
      "whatsapp_templates_category_check",
      "whatsapp_templates_approved_at_check",
    ]));
    const seed = readFileSync("drizzle/0034_phase_c_whatsapp_template_seed.sql", "utf8");
    expect(whatsappTemplateSeedRows()).toHaveLength(Object.keys(WHATSAPP_TEMPLATES).length);
    for (const row of whatsappTemplateSeedRows()) {
      expect(seed).toContain(`'${row.key}'`);
      expect(seed).toContain(`'${row.elementName}'`);
      expect(seed).toContain(row.variables.map((variable) => `'${variable}'`).join(","));
    }
    expect(seed).not.toContain("'approved'");
  });
});
