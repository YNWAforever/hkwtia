import {
  type AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {sql} from "drizzle-orm";

import {M3_AUTOMATION_JOB_KIND_SQL_LIST} from "@/lib/jobs/kinds";
import {MEMBERSHIP_PLAN_CODES, MEMBERSHIP_STATUSES} from "@/lib/membership/constants";

const createdAt = (name: string) => timestamp(name, {withTimezone: true}).defaultNow().notNull();
const updatedAt = (name: string) => timestamp(name, {withTimezone: true}).defaultNow().notNull();

export const membershipStatusEnum = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const membershipPlanCodeEnum = pgEnum("membership_plan_code", MEMBERSHIP_PLAN_CODES);
export const membershipApplicationStatusEnum = pgEnum("membership_application_status", [
  "draft",
  "pending_payment",
  "pending_review",
  "completed",
  "abandoned",
]);
export const membershipApplicationStepEnum = pgEnum("membership_application_step", [
  "profile",
  "company",
  "checkout",
  "complete",
  "review",
]);
export const companyMemberRoleEnum = pgEnum("company_member_role", ["owner", "admin", "member"]);
export const jobStateEnum = pgEnum("job_state", ["processing", "completed", "failed"]);
export const billingAttemptStateEnum = pgEnum("billing_attempt_state", ["active", "completed", "abandoned", "expired"]);
export const userRoleEnum = pgEnum("user_role", ["member", "staff", "exco", "superadmin"]);
export const billingIntervalEnum = pgEnum("billing_interval", ["annual", "monthly", "none"]);
export const registrationStatusEnum = pgEnum("registration_status", ["registered", "waitlist", "cancelled", "attended", "no_show"]);
export const campaignStatusEnum = pgEnum("campaign_status", ["queued", "processing", "completed", "cancelled"]);
export const recipientStatusEnum = pgEnum("campaign_recipient_status", ["queued", "processing", "sent", "failed", "suppressed"]);
export const approvalStatusEnum = pgEnum("approval_status", ["pending", "approved", "rejected", "expired"]);
export const journeyStatusEnum = pgEnum("journey_status", ["scheduled", "processing", "sent", "skipped", "failed"]);
export const staffTaskStatusEnum = pgEnum("staff_task_status", ["open", "resolved"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "closed", "deleted"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant", "tool"]);
export const messageChannelEnum = pgEnum("message_channel", ["web", "whatsapp"]);
export const agentRunStatusEnum = pgEnum("agent_run_status", ["running", "disabled", "completed", "failed", "escalated"]);
export const agentNameEnum = pgEnum("agent_name", [
  "concierge",
  "retention_analyst",
  "board_reporter",
]);
export const postKindEnum = pgEnum("post_kind", ["news", "buildlog", "page"]);
export const agentTriggerEnum = pgEnum("agent_trigger", ["web", "whatsapp", "scheduled"]);
export const showcaseListingStatusEnum = pgEnum("showcase_listing_status", [
  "draft",
  "pending_review",
  "published",
  "rejected",
]);
export const leadStatusEnum = pgEnum("lead_status", ["new", "contacted", "closed"]);
export type ShowcaseListingStatus = (typeof showcaseListingStatusEnum.enumValues)[number];

const vector = customType<{data: number[]; driverData: string}>({
  dataType() {
    return "vector(1536)";
  },
});

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  authUserId: text("auth_user_id").notNull().unique(),
  email: text("email"),
  role: userRoleEnum("role").default("member").notNull(),
  lastLoginAt: timestamp("last_login_at", {withTimezone: true}),
  consentMarketing: boolean("consent_marketing").default(false).notNull(),
  interests: text("interests").array().default(sql`'{}'::text[]`).notNull(),
  displayName: text("display_name").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  locale: varchar("locale", {length: 10}).default("en").notNull(),
  onboardingState: text("onboarding_state").default("profile").notNull(),
  directoryVisible: boolean("directory_visible").default(false).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
  whatsappOptIn: boolean("whatsapp_opt_in").default(false).notNull(),
  whatsappNumber: text("whatsapp_number"),
});

export const companies = pgTable("companies", {
  id: uuid("id").defaultRandom().primaryKey(),
  legalName: text("legal_name").notNull(),
  displayName: text("display_name").notNull(),
  website: text("website"),
  industry: text("industry"),
  sizeBand: text("size_band"),
  description: text("description"),
  logoReference: text("logo_reference"),
  directoryVisible: boolean("directory_visible").default(false).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
});

export const companyMembers = pgTable(
  "company_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, {onDelete: "cascade"}),
    userId: text("user_id")
      .notNull()
      .references(() => profiles.id, {onDelete: "cascade"}),
    role: companyMemberRoleEnum("role").default("member").notNull(),
    joinedAt: timestamp("joined_at", {withTimezone: true}).defaultNow().notNull(),
    revokedAt: timestamp("revoked_at", {withTimezone: true}),
  },
  (table) => [
    uniqueIndex("company_members_active_company_user_unique")
      .on(table.companyId, table.userId)
      .where(sql`${table.revokedAt} IS NULL`),
    index("company_members_user_idx").on(table.userId),
  ],
);

export const seatInvitations = pgTable(
  "seat_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, {onDelete: "cascade"}),
    inviterUserId: text("inviter_user_id")
      .notNull()
      .references(() => profiles.id, {onDelete: "restrict"}),
    invitedEmail: text("invited_email").notNull(),
    role: companyMemberRoleEnum("role").default("member").notNull(),
    tokenDigest: text("token_digest").notNull(),
    expiresAt: timestamp("expires_at", {withTimezone: true}).notNull(),
    acceptedAt: timestamp("accepted_at", {withTimezone: true}),
    acceptedByUserId: text("accepted_by_user_id").references(() => profiles.id, {onDelete: "set null"}),
    revokedAt: timestamp("revoked_at", {withTimezone: true}),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    unique("seat_invitations_token_digest_unique").on(table.tokenDigest),
    index("seat_invitations_company_idx").on(table.companyId),
  ],
);

export const membershipPlans = pgTable("membership_plans", {
  code: membershipPlanCodeEnum("code").primaryKey(),
  audience: text("audience").notNull(),
  billingBehavior: text("billing_behavior").notNull(),
  stripePriceReference: text("stripe_price_reference"),
  annualPriceHkd: integer("annual_price_hkd"),
  monthlyPriceHkd: integer("monthly_price_hkd"),
  seatAllowance: integer("seat_allowance").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
});

export const membershipApplications = pgTable(
  "membership_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicantUserId: text("applicant_user_id")
      .notNull()
      .references(() => profiles.id, {onDelete: "cascade"}),
    planCode: membershipPlanCodeEnum("plan_code")
      .notNull()
      .references(() => membershipPlans.code, {onDelete: "restrict"}),
    companyId: uuid("company_id").references(() => companies.id, {onDelete: "set null"}),
    currentStep: membershipApplicationStepEnum("current_step").default("profile").notNull(),
    status: membershipApplicationStatusEnum("status").default("draft").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    index("membership_applications_applicant_idx").on(table.applicantUserId),
    index("membership_applications_company_idx").on(table.companyId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id").references(() => profiles.id, {onDelete: "cascade"}),
    companyId: uuid("company_id").references(() => companies.id, {onDelete: "cascade"}),
    applicationId: uuid("application_id").references(() => membershipApplications.id, {onDelete: "cascade"}),
    planCode: membershipPlanCodeEnum("plan_code")
      .notNull()
      .references(() => membershipPlans.code, {onDelete: "restrict"}),
    status: membershipStatusEnum("status").default("pending_payment").notNull(),
    billingInterval: billingIntervalEnum("billing_interval").default("annual").notNull(),
    seatLimit: integer("seat_limit").notNull(),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    billingPeriodStart: timestamp("billing_period_start", {withTimezone: true}),
    billingPeriodEnd: timestamp("billing_period_end", {withTimezone: true}),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    check(
      "memberships_target_check",
      sql`(${table.ownerUserId} IS NOT NULL AND ${table.companyId} IS NULL) OR (${table.ownerUserId} IS NULL AND ${table.companyId} IS NOT NULL)`,
    ),
    check("memberships_seat_limit_check", sql`${table.seatLimit} >= 0`),
    uniqueIndex("memberships_stripe_subscription_unique")
      .on(table.stripeSubscriptionId)
      .where(sql`${table.stripeSubscriptionId} IS NOT NULL`),
    uniqueIndex("memberships_application_unique")
      .on(table.applicationId)
      .where(sql`${table.applicationId} IS NOT NULL`),
    index("memberships_owner_idx").on(table.ownerUserId),
    index("memberships_company_idx").on(table.companyId),
    index("memberships_billing_period_end_idx").on(table.billingPeriodEnd),
  ],
);

export const billingAttempts = pgTable(
  "billing_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id").notNull().references(() => memberships.id, {onDelete: "cascade"}),
    attemptNumber: integer("attempt_number").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    priceReference: text("price_reference").notNull(),
    state: billingAttemptStateEnum("state").default("active").notNull(),
    stripeCheckoutSessionId: text("stripe_checkout_session_id"),
    checkoutUrl: text("checkout_url"),
    recoveryRequestId: text("recovery_request_id"),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
    endedAt: timestamp("ended_at", {withTimezone: true}),
  },
  (table) => [
    check("billing_attempts_number_check", sql`${table.attemptNumber} > 0`),
    unique("billing_attempts_membership_number_unique").on(table.membershipId, table.attemptNumber),
    unique("billing_attempts_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("billing_attempts_active_membership_unique")
      .on(table.membershipId)
      .where(sql`${table.state} = 'active'`),
    uniqueIndex("billing_attempts_stripe_session_unique")
      .on(table.stripeCheckoutSessionId)
      .where(sql`${table.stripeCheckoutSessionId} IS NOT NULL`),
    uniqueIndex("billing_attempts_recovery_request_unique")
      .on(table.membershipId, table.recoveryRequestId)
      .where(sql`${table.recoveryRequestId} IS NOT NULL`),
    index("billing_attempts_membership_idx").on(table.membershipId),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runKey: text("run_key").notNull().unique(),
    kind: text("kind").notNull(),
    state: jobStateEnum("state").default("processing").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastError: text("last_error"),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
    completedAt: timestamp("completed_at", {withTimezone: true}),
  },
  (table) => [
    index("jobs_state_idx").on(table.state),
    index("jobs_automation_recent_idx")
      .on(table.updatedAt.desc(), table.id.desc())
      .where(sql`${table.kind} IN (${sql.raw(M3_AUTOMATION_JOB_KIND_SQL_LIST)})`),
  ],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").references(() => profiles.id, {onDelete: "set null"}),
    actorType: text("actor_type").notNull(),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt("created_at"),
  },
  (table) => [index("audit_events_target_idx").on(table.targetType, table.targetId)],
);
export const engagementEvents = pgTable("engagement_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  companyId: uuid("company_id").references(() => companies.id, {onDelete: "set null"}),
  type: text("type").notNull(),
  points: integer("points").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  occurredAt: timestamp("occurred_at", {withTimezone: true}).defaultNow().notNull(),
}, (table) => [index("engagement_events_profile_occurred_idx").on(table.profileId, table.occurredAt)]);

export const engagementScores = pgTable("engagement_scores", {
  profileId: text("profile_id").primaryKey().references(() => profiles.id, {onDelete: "cascade"}),
  score: numeric("score", {precision: 8, scale: 2}).notNull(),
  trend: numeric("trend", {precision: 8, scale: 2}).notNull(),
  computedAt: timestamp("computed_at", {withTimezone: true}).notNull(),
});

export const memberNotes = pgTable("member_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  authorProfileId: text("author_profile_id").notNull().references(() => profiles.id, {onDelete: "restrict"}),
  body: text("body").notNull(),
  replacesNoteId: uuid("replaces_note_id").references((): AnyPgColumn => memberNotes.id, {onDelete: "set null"}),
  createdAt: createdAt("created_at"),
}, (table) => [index("member_notes_profile_created_idx").on(table.profileId, table.createdAt)]);

export const journeyState = pgTable("journey_state", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  membershipId: uuid("membership_id").references(() => memberships.id, {onDelete: "cascade"}),
  journey: text("journey").notNull(),
  instanceKey: text("instance_key").notNull(),
  step: text("step").notNull(),
  scheduledAt: timestamp("scheduled_at", {withTimezone: true}).notNull(),
  status: journeyStatusEnum("status").default("scheduled").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  claimedAt: timestamp("claimed_at", {withTimezone: true}),
  claimExpiresAt: timestamp("claim_expires_at", {withTimezone: true}),
  deliveryKey: text("delivery_key").notNull(),
  errorCode: text("error_code"),
  completedAt: timestamp("completed_at", {withTimezone: true}),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  unique("journey_state_profile_instance_step_unique").on(table.profileId, table.journey, table.instanceKey, table.step),
  unique("journey_state_delivery_key_unique").on(table.deliveryKey),
  index("journey_state_due_idx").on(table.status, table.scheduledAt),
  index("journey_state_profile_idx").on(table.profileId, table.createdAt),
  index("journey_state_admin_recent_idx")
    .on(table.scheduledAt.desc(), table.id.desc()),
]);

export const emailLog = pgTable("email_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").references(() => profiles.id, {onDelete: "set null"}),
  journeyStateId: uuid("journey_state_id").references(() => journeyState.id, {onDelete: "set null"}),
  template: text("template").notNull(),
  subject: text("subject").notNull(),
  status: text("status").notNull(),
  providerId: text("provider_id"),
  idempotencyKey: text("idempotency_key").default(sql`gen_random_uuid()::text`).notNull(),
  locale: varchar("locale", {length: 10}).default("en").notNull(),
  classification: text("classification").default("transactional").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  errorCode: text("error_code"),
  createdAt: createdAt("created_at"),
}, (table) => [
  unique("email_log_idempotency_key_unique").on(table.idempotencyKey),
  index("email_log_profile_created_idx").on(table.profileId, table.createdAt),
  index("email_log_journey_state_idx").on(table.journeyStateId),
]);

export const whatsappLog = pgTable("whatsapp_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").references(() => profiles.id, {onDelete: "set null"}),
  journeyStateId: uuid("journey_state_id").references(() => journeyState.id, {onDelete: "set null"}),
  template: text("template").notNull(),
  status: text("status").notNull(),
  providerId: text("provider_id"),
  idempotencyKey: text("idempotency_key").notNull(),
  locale: varchar("locale", {length: 10}).default("en").notNull(),
  classification: text("classification").default("transactional").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  errorCode: text("error_code"),
  createdAt: createdAt("created_at"),
}, (table) => [
  unique("whatsapp_log_idempotency_key_unique").on(table.idempotencyKey),
  index("whatsapp_log_profile_created_idx").on(table.profileId, table.createdAt),
  index("whatsapp_log_journey_state_idx").on(table.journeyStateId),
]);

export const messageSuppressions = pgTable("message_suppressions", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  channel: text("channel").notNull(),
  classification: text("classification").notNull(),
  reasonCode: text("reason_code"),
  createdAt: createdAt("created_at"),
}, (table) => [
  unique("message_suppressions_profile_channel_classification_unique").on(table.profileId, table.channel, table.classification),
  index("message_suppressions_profile_idx").on(table.profileId),
]);

export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    namespace: text("namespace").notNull(),
    locale: varchar("locale", {length: 10}).notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    content: text("content").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    embedding: vector("embedding").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    index("kb_documents_namespace_locale_idx").on(table.namespace, table.locale),
    index("kb_documents_created_idx").on(table.createdAt),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentKind: varchar("agent_kind", {length: 32})
      .default("concierge")
      .notNull(),
    profileId: text("profile_id").references(() => profiles.id, {onDelete: "set null"}),
    anonymousOwnerHash: text("anonymous_owner_hash"),
    locale: varchar("locale", {length: 10}).default("en").notNull(),
    status: conversationStatusEnum("status").default("active").notNull(),
    lastMessageAt: timestamp("last_message_at", {withTimezone: true}),
    expiresAt: timestamp("expires_at", {withTimezone: true}).notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    check(
      "conversations_agent_kind_check",
      sql`${table.agentKind} IN ('concierge', 'retention-analyst', 'board-reporter')`,
    ),
    check(
      "conversations_owner_check",
      sql`(${table.profileId} IS NOT NULL AND ${table.anonymousOwnerHash} IS NULL) OR (${table.profileId} IS NULL AND ${table.anonymousOwnerHash} IS NOT NULL)`,
    ),
    index("conversations_profile_idx").on(table.profileId),
    index("conversations_anonymous_owner_idx").on(table.anonymousOwnerHash),
    index("conversations_recent_idx").on(table.updatedAt.desc(), table.id.desc()),
    index("conversations_expires_at_idx").on(table.expiresAt),
    index("conversations_agent_kind_expires_idx").on(
      table.agentKind,
      table.expiresAt,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, {onDelete: "cascade"}),
    role: messageRoleEnum("role").notNull(),
    channel: messageChannelEnum("channel").notNull(),
    content: text("content").notNull(),
    providerMessageId: text("provider_message_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
    citations: jsonb("citations").$type<Array<Record<string, unknown>>>().default([]).notNull(),
    createdAt: createdAt("created_at"),
  },
  (table) => [
    uniqueIndex("messages_provider_message_id_unique")
      .on(table.providerMessageId)
      .where(sql`${table.providerMessageId} IS NOT NULL`),
    index("messages_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("messages_created_at_idx").on(table.createdAt),
  ],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, {onDelete: "set null"}),
    profileId: text("profile_id").references(() => profiles.id, {onDelete: "set null"}),
    agent: agentNameEnum("agent").default("concierge").notNull(),
    trigger: agentTriggerEnum("trigger").notNull(),
    status: agentRunStatusEnum("status").default("running").notNull(),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    costUsd: numeric("cost_usd", {precision: 12, scale: 6}).default("0").notNull(),
    latencyMs: integer("latency_ms"),
    summary: text("summary"),
    errorCode: text("error_code"),
    csatScore: integer("csat_score"),
    startedAt: createdAt("started_at"),
    completedAt: timestamp("completed_at", {withTimezone: true}),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    check("agent_runs_csat_score_check", sql`${table.csatScore} IS NULL OR (${table.csatScore} >= 1 AND ${table.csatScore} <= 5)`),
    index("agent_runs_conversation_created_idx").on(table.conversationId, table.createdAt),
    index("agent_runs_profile_idx").on(table.profileId),
    index("agent_runs_created_at_idx").on(table.createdAt),
  ],
);
export const staffTasks = pgTable("staff_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").references(() => profiles.id, {onDelete: "cascade"}),
  journeyStateId: uuid("journey_state_id").references(() => journeyState.id, {onDelete: "set null"}),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  summaryCode: text("summary_code").notNull(),
  context: jsonb("context")
    .$type<{
      contactEmail?: string;
      conversationId?: string;
      agentRunId?: string;
      reasonCode?: string;
      locale?: "en" | "zh-HK";
    }>()
    .notNull()
    .default({}),
  status: staffTaskStatusEnum("status").default("open").notNull(),
  resolvedAt: timestamp("resolved_at", {withTimezone: true}),
  resolvedByProfileId: text("resolved_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [
  unique("staff_tasks_dedupe_key_unique").on(table.dedupeKey),
  index("staff_tasks_profile_status_idx").on(table.profileId, table.status),
  index("staff_tasks_journey_state_idx").on(table.journeyStateId),
]);

export const savedSegments = pgTable("saved_segments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerProfileId: text("owner_profile_id").notNull().references(() => profiles.id, {onDelete: "restrict"}),
  nameEn: text("name_en").notNull(),
  nameZh: text("name_zh"),
  filterVersion: integer("filter_version").default(1).notNull(),
  filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").defaultRandom().primaryKey(),
  segmentId: uuid("segment_id").notNull().references(() => savedSegments.id, {onDelete: "restrict"}),
  createdByProfileId: text("created_by_profile_id").notNull().references(() => profiles.id, {onDelete: "restrict"}),
  template: text("template").notNull(),
  localeStrategy: text("locale_strategy").default("profile").notNull(),
  status: campaignStatusEnum("status").default("queued").notNull(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: createdAt("created_at"),
});

export const campaignRecipients = pgTable("campaign_recipients", {
  id: uuid("id").defaultRandom().primaryKey(),
  campaignId: uuid("campaign_id").notNull().references(() => campaigns.id, {onDelete: "cascade"}),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "restrict"}),
  email: text("email").notNull(),
  locale: varchar("locale", {length: 10}).notNull(),
  variables: jsonb("variables").$type<Record<string, string>>().notNull(),
  status: recipientStatusEnum("status").default("queued").notNull(),
  attemptCount: integer("attempt_count").default(0).notNull(),
  claimedAt: timestamp("claimed_at", {withTimezone: true}),
  claimExpiresAt: timestamp("claim_expires_at", {withTimezone: true}),
  errorCode: text("error_code"),
}, (table) => [
  unique("campaign_recipients_campaign_profile_unique").on(table.campaignId, table.profileId),
  index("campaign_recipients_due_idx").on(table.status, table.claimExpiresAt),
]);

export const events = pgTable("events", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  titleEn: text("title_en").notNull(),
  titleZh: text("title_zh"),
  descriptionEn: text("description_en").notNull(),
  descriptionZh: text("description_zh"),
  startsAt: timestamp("starts_at", {withTimezone: true}).notNull(),
  endsAt: timestamp("ends_at", {withTimezone: true}),
  venue: text("venue"),
  capacity: integer("capacity"),
  memberOnly: boolean("member_only").default(false).notNull(),
  published: boolean("published").default(false).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
}, (table) => [index("events_published_starts_idx").on(table.published, table.startsAt)]);

export const eventRegistrations = pgTable("event_registrations", {
  eventId: uuid("event_id").notNull().references(() => events.id, {onDelete: "cascade"}),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  status: registrationStatusEnum("status").default("registered").notNull(),
  checkedInAt: timestamp("checked_in_at", {withTimezone: true}),
}, (table) => [
  primaryKey({columns: [table.eventId, table.profileId]}),
  index("event_registrations_profile_idx").on(table.profileId),
]);

export const approvals = pgTable("approvals", {
  id: uuid("id").defaultRandom().primaryKey(),
  actionType: text("action_type").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  requestKey: text("request_key"),
  status: approvalStatusEnum("status").default("pending").notNull(),
  requestedByProfileId: text("requested_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  requestedAt: createdAt("requested_at"),
  decidedByProfileId: text("decided_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  decidedAt: timestamp("decided_at", {withTimezone: true}),
}, (table) => [
  uniqueIndex("approvals_request_key_unique")
    .on(table.requestKey)
    .where(sql`${table.requestKey} IS NOT NULL`),
  index("approvals_status_requested_idx").on(table.status, table.requestedAt),
]);

export const posts = pgTable(
  "posts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    kind: postKindEnum("kind").notNull(),
    titleEn: text("title_en").notNull(),
    titleZh: text("title_zh").notNull(),
    bodyMdx: text("body_mdx").notNull(),
    publishedAt: timestamp("published_at", {withTimezone: true}),
    author: text("author").notNull(),
    sourceKey: text("source_key"),
    agentRunId: uuid("agent_run_id")
      .references(() => agentRuns.id, {onDelete: "set null"}),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("posts_slug_unique").on(table.slug),
    uniqueIndex("posts_source_key_unique")
      .on(table.sourceKey)
      .where(sql`${table.sourceKey} IS NOT NULL`),
  ],
);

export const showcaseListings = pgTable(
  "showcase_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, {onDelete: "cascade"}),
    slug: text("slug").notNull(),
    status: showcaseListingStatusEnum("status").default("draft").notNull(),
    premium: boolean("premium").default(false).notNull(),
    views: integer("views").default(0).notNull(),
    memberSince: date("member_since").notNull(),
    nameEn: text("name_en").notNull(),
    nameZhHk: text("name_zh_hk").notNull(),
    taglineEn: text("tagline_en").notNull(),
    taglineZhHk: text("tagline_zh_hk").notNull(),
    descriptionEn: text("description_en").notNull(),
    descriptionZhHk: text("description_zh_hk").notNull(),
    category: text("category").notNull(),
    useCases: text("use_cases").array().default(sql`'{}'::text[]`).notNull(),
    deploymentOptions: text("deployment_options").array().default(sql`'{}'::text[]`).notNull(),
    supportedLanguages: text("supported_languages").array().default(sql`'{}'::text[]`).notNull(),
    worksWith: text("works_with").array().default(sql`'{}'::text[]`).notNull(),
    videoUrl: text("video_url"),
    caseStudyUrl: text("case_study_url"),
    caseStudySummaryEn: text("case_study_summary_en"),
    caseStudySummaryZhHk: text("case_study_summary_zh_hk"),
    logoReference: text("logo_reference"),
    reviewedAt: timestamp("reviewed_at", {withTimezone: true}),
    reviewedByProfileId: text("reviewed_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
    rejectionReason: text("rejection_reason"),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    uniqueIndex("showcase_listings_company_unique").on(table.companyId),
    uniqueIndex("showcase_listings_slug_unique").on(table.slug),
    check("showcase_listings_views_check", sql`${table.views} >= 0`),
    index("showcase_listings_status_premium_category_idx").on(table.status, table.premium, table.category),
    index("showcase_listings_use_cases_idx").using("gin", table.useCases),
    index("showcase_listings_deployment_options_idx").using("gin", table.deploymentOptions),
    index("showcase_listings_supported_languages_idx").using("gin", table.supportedLanguages),
    index("showcase_listings_works_with_idx").using("gin", table.worksWith),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => showcaseListings.id, {onDelete: "cascade"}),
    contactName: text("contact_name").notNull(),
    email: text("email").notNull(),
    organization: text("organization"),
    message: text("message"),
    locale: varchar("locale", {length: 10}).default("en").notNull(),
    status: leadStatusEnum("status").default("new").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdAt: createdAt("created_at"),
    updatedAt: updatedAt("updated_at"),
  },
  (table) => [
    unique("leads_idempotency_key_unique").on(table.idempotencyKey),
    index("leads_listing_created_idx").on(table.listingId, table.createdAt),
  ],
);

export const aiopsMonthlyMetrics = pgMaterializedView(
  "aiops_monthly_metrics",
  {
    monthStart: date("month_start").notNull(),
    isPartialMonth: boolean("is_partial_month").notNull(),
    conversationCount: integer("conversation_count").notNull(),
    terminalConversationCount: integer("terminal_conversation_count").notNull(),
    resolvedConversationCount: integer("resolved_conversation_count").notNull(),
    escalatedConversationCount: integer("escalated_conversation_count").notNull(),
    failedConversationCount: integer("failed_conversation_count").notNull(),
    agentResolvedRate: numeric("agent_resolved_rate", {precision: 7, scale: 6}),
    escalationRate: numeric("escalation_rate", {precision: 7, scale: 6}),
    failureRate: numeric("failure_rate", {precision: 7, scale: 6}),
    medianFirstResponseMs: integer("median_first_response_ms"),
    firstResponseSampleCount: integer("first_response_sample_count").notNull(),
    csatAverage: numeric("csat_average", {precision: 4, scale: 2}),
    csatResponseCount: integer("csat_response_count").notNull(),
    staffHoursSaved: numeric("staff_hours_saved", {precision: 12, scale: 2}).notNull(),
    llmCostUsd: numeric("llm_cost_usd", {precision: 12, scale: 6}).notNull(),
    renewalDueCount: integer("renewal_due_count").notNull(),
    renewalPaidCount: integer("renewal_paid_count").notNull(),
    renewalRate: numeric("renewal_rate", {precision: 7, scale: 6}),
    firstYearRenewalDueCount: integer("first_year_renewal_due_count").notNull(),
    firstYearRenewalPaidCount: integer("first_year_renewal_paid_count").notNull(),
    firstYearRenewalRate: numeric("first_year_renewal_rate", {precision: 7, scale: 6}),
    refreshedAt: timestamp("refreshed_at", {withTimezone: true}).notNull(),
  },
).as(sql`
  WITH settings AS (
    SELECT
      date_trunc('month', timezone('Asia/Hong_Kong', now()))::date
        AS current_month,
      now() AS refreshed_at
  ),
  months AS (
    SELECT
      generated.month_start::date AS month_start,
      generated.month_start::date = settings.current_month AS is_partial_month,
      generated.month_start::timestamp AT TIME ZONE 'Asia/Hong_Kong' AS month_from,
      (generated.month_start + interval '1 month')::timestamp
        AT TIME ZONE 'Asia/Hong_Kong' AS month_to,
      settings.refreshed_at
    FROM settings
    CROSS JOIN LATERAL generate_series(
      settings.current_month - interval '11 months',
      settings.current_month,
      interval '1 month'
    ) AS generated(month_start)
  ),
  month_conversations AS (
    SELECT months.month_start, months.month_to, conversations.id
    FROM months
    INNER JOIN conversations
      ON conversations.agent_kind = 'concierge'
     AND conversations.created_at >= months.month_from
     AND conversations.created_at < months.month_to
  ),
  latest_terminal AS (
    SELECT DISTINCT ON (month_conversations.month_start, agent_runs.conversation_id)
      month_conversations.month_start,
      agent_runs.conversation_id,
      agent_runs.status
    FROM month_conversations
    INNER JOIN agent_runs
      ON agent_runs.conversation_id = month_conversations.id
     AND agent_runs.agent = 'concierge'
     AND agent_runs.status IN ('completed', 'escalated', 'failed')
     AND agent_runs.completed_at IS NOT NULL
     AND agent_runs.completed_at < month_conversations.month_to
    ORDER BY month_conversations.month_start, agent_runs.conversation_id,
      agent_runs.completed_at DESC, agent_runs.created_at DESC,
      agent_runs.id DESC
  ),
  first_user AS (
    SELECT DISTINCT ON (month_conversations.month_start, messages.conversation_id)
      month_conversations.month_start,
      messages.conversation_id,
      messages.created_at,
      messages.id
    FROM month_conversations
    INNER JOIN messages ON messages.conversation_id = month_conversations.id
    WHERE messages.role = 'user'
    ORDER BY month_conversations.month_start, messages.conversation_id,
      messages.created_at, messages.id
  ),
  first_response AS (
    SELECT
      first_user.month_start,
      first_user.conversation_id,
      floor(extract(epoch FROM (
        min(messages.created_at) - first_user.created_at
      )) * 1000)::integer AS latency_ms
    FROM first_user
    INNER JOIN messages
      ON messages.conversation_id = first_user.conversation_id
     AND messages.role = 'assistant'
     AND messages.created_at >= first_user.created_at
    GROUP BY first_user.month_start, first_user.conversation_id,
      first_user.created_at
    HAVING min(messages.created_at) >= first_user.created_at
  ),
  conversation_aggregates AS (
    SELECT
      months.month_start,
      count(DISTINCT month_conversations.id)::integer AS conversation_count,
      count(DISTINCT latest_terminal.conversation_id)::integer
        AS terminal_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'completed')::integer
        AS resolved_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'escalated')::integer
        AS escalated_conversation_count,
      count(DISTINCT latest_terminal.conversation_id)
        FILTER (WHERE latest_terminal.status = 'failed')::integer
        AS failed_conversation_count
    FROM months
    LEFT JOIN month_conversations
      ON month_conversations.month_start = months.month_start
    LEFT JOIN latest_terminal
      ON latest_terminal.month_start = months.month_start
     AND latest_terminal.conversation_id = month_conversations.id
    GROUP BY months.month_start
  ),
  response_aggregates AS (
    SELECT
      months.month_start,
      percentile_disc(0.5) WITHIN GROUP (ORDER BY first_response.latency_ms)
        FILTER (WHERE first_response.latency_ms >= 0)::integer
        AS median_first_response_ms,
      count(first_response.latency_ms)
        FILTER (WHERE first_response.latency_ms >= 0)::integer
        AS first_response_sample_count
    FROM months
    LEFT JOIN first_response ON first_response.month_start = months.month_start
    GROUP BY months.month_start
  ),
  cost_aggregates AS (
    SELECT
      months.month_start,
      coalesce(sum(agent_runs.cost_usd), 0)::numeric(12, 6) AS llm_cost_usd
    FROM months
    LEFT JOIN agent_runs
      ON agent_runs.started_at >= months.month_from
     AND agent_runs.started_at < months.month_to
    GROUP BY months.month_start
  ),
  csat_aggregates AS (
    SELECT
      months.month_start,
      avg(agent_runs.csat_score)::numeric(4, 2) AS csat_average,
      count(agent_runs.csat_score)::integer AS csat_response_count
    FROM months
    LEFT JOIN agent_runs
      ON agent_runs.agent = 'concierge'
     AND agent_runs.status IN ('completed', 'escalated', 'failed')
     AND agent_runs.csat_score IS NOT NULL
     AND agent_runs.completed_at >= months.month_from
     AND agent_runs.completed_at < months.month_to
    GROUP BY months.month_start
  ),
  renewal_per_membership AS (
    SELECT
      months.month_start,
      engagement_events.metadata ->> 'membershipId' AS membership_id,
      bool_or(engagement_events.type = 'renewal_paid') AS paid,
      bool_or(
        jsonb_typeof(engagement_events.metadata -> 'renewalOrdinal') = 'number'
        AND engagement_events.metadata -> 'renewalOrdinal' = '1'::jsonb
      ) AS first_year_due,
      bool_or(
        engagement_events.type = 'renewal_paid'
        AND jsonb_typeof(engagement_events.metadata -> 'renewalOrdinal') = 'number'
        AND engagement_events.metadata -> 'renewalOrdinal' = '1'::jsonb
      ) AS first_year_paid
    FROM months
    INNER JOIN engagement_events
      ON engagement_events.occurred_at >= months.month_from
     AND engagement_events.occurred_at < months.month_to
     AND engagement_events.type IN ('renewal_paid', 'renewal_failed')
    INNER JOIN memberships
      ON memberships.id::text =
        engagement_events.metadata ->> 'membershipId'
    GROUP BY months.month_start,
      engagement_events.metadata ->> 'membershipId'
  ),
  renewal_aggregates AS (
    SELECT
      months.month_start,
      count(renewal_per_membership.membership_id)::integer
        AS renewal_due_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.paid)::integer
        AS renewal_paid_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.first_year_due)::integer
        AS first_year_renewal_due_count,
      count(renewal_per_membership.membership_id)
        FILTER (WHERE renewal_per_membership.first_year_paid)::integer
        AS first_year_renewal_paid_count
    FROM months
    LEFT JOIN renewal_per_membership
      ON renewal_per_membership.month_start = months.month_start
    GROUP BY months.month_start
  )
  SELECT
    months.month_start,
    months.is_partial_month,
    conversation_aggregates.conversation_count,
    conversation_aggregates.terminal_conversation_count,
    conversation_aggregates.resolved_conversation_count,
    conversation_aggregates.escalated_conversation_count,
    conversation_aggregates.failed_conversation_count,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.resolved_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS agent_resolved_rate,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.escalated_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS escalation_rate,
    CASE WHEN conversation_aggregates.terminal_conversation_count = 0
      THEN NULL ELSE
      conversation_aggregates.failed_conversation_count::numeric
        / conversation_aggregates.terminal_conversation_count END
      ::numeric(7, 6) AS failure_rate,
    response_aggregates.median_first_response_ms,
    response_aggregates.first_response_sample_count,
    csat_aggregates.csat_average,
    csat_aggregates.csat_response_count,
    (conversation_aggregates.resolved_conversation_count::numeric / 10)
      ::numeric(12, 2) AS staff_hours_saved,
    cost_aggregates.llm_cost_usd,
    renewal_aggregates.renewal_due_count,
    renewal_aggregates.renewal_paid_count,
    CASE WHEN renewal_aggregates.renewal_due_count = 0
      THEN NULL ELSE
      renewal_aggregates.renewal_paid_count::numeric
        / renewal_aggregates.renewal_due_count END
      ::numeric(7, 6) AS renewal_rate,
    renewal_aggregates.first_year_renewal_due_count,
    renewal_aggregates.first_year_renewal_paid_count,
    CASE WHEN renewal_aggregates.first_year_renewal_due_count = 0
      THEN NULL ELSE
      renewal_aggregates.first_year_renewal_paid_count::numeric
        / renewal_aggregates.first_year_renewal_due_count END
      ::numeric(7, 6) AS first_year_renewal_rate,
    months.refreshed_at
  FROM months
  INNER JOIN conversation_aggregates USING (month_start)
  INNER JOIN response_aggregates USING (month_start)
  INNER JOIN cost_aggregates USING (month_start)
  INNER JOIN csat_aggregates USING (month_start)
  INNER JOIN renewal_aggregates USING (month_start)
  ORDER BY months.month_start
`);

export type Profile = typeof profiles.$inferSelect;
export type Company = typeof companies.$inferSelect;
export type CompanyMember = typeof companyMembers.$inferSelect;
export type SeatInvitation = typeof seatInvitations.$inferSelect;
export type MembershipPlan = typeof membershipPlans.$inferSelect;
export type MembershipApplication = typeof membershipApplications.$inferSelect;
export type Membership = typeof memberships.$inferSelect;
export type BillingAttempt = typeof billingAttempts.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type EngagementEvent = typeof engagementEvents.$inferSelect;
export type EngagementScore = typeof engagementScores.$inferSelect;
export type MemberNote = typeof memberNotes.$inferSelect;
export type JourneyState = typeof journeyState.$inferSelect;
export type EmailLog = typeof emailLog.$inferSelect;
export type WhatsappLog = typeof whatsappLog.$inferSelect;
export type MessageSuppression = typeof messageSuppressions.$inferSelect;
export type KnowledgeDocument = typeof kbDocuments.$inferSelect;
export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
export type StaffTask = typeof staffTasks.$inferSelect;
export type SavedSegment = typeof savedSegments.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type ShowcaseListing = typeof showcaseListings.$inferSelect;
export type NewShowcaseListing = typeof showcaseListings.$inferInsert;
export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
