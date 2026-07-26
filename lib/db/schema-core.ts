import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
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
  (table) => [index("jobs_state_idx").on(table.state)],
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

export const staffTasks = pgTable("staff_tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  profileId: text("profile_id").notNull().references(() => profiles.id, {onDelete: "cascade"}),
  journeyStateId: uuid("journey_state_id").references(() => journeyState.id, {onDelete: "set null"}),
  kind: text("kind").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  summaryCode: text("summary_code").notNull(),
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
  status: approvalStatusEnum("status").default("pending").notNull(),
  requestedByProfileId: text("requested_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  requestedAt: createdAt("requested_at"),
  decidedByProfileId: text("decided_by_profile_id").references(() => profiles.id, {onDelete: "set null"}),
  decidedAt: timestamp("decided_at", {withTimezone: true}),
}, (table) => [index("approvals_status_requested_idx").on(table.status, table.requestedAt)]);

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
export type StaffTask = typeof staffTasks.$inferSelect;
export type SavedSegment = typeof savedSegments.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type CampaignRecipient = typeof campaignRecipients.$inferSelect;
export type Event = typeof events.$inferSelect;
export type EventRegistration = typeof eventRegistrations.$inferSelect;
export type Approval = typeof approvals.$inferSelect;
