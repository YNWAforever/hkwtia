import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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

export const profiles = pgTable("profiles", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  phone: text("phone"),
  jobTitle: text("job_title"),
  locale: varchar("locale", {length: 10}).default("en").notNull(),
  onboardingState: text("onboarding_state").default("profile").notNull(),
  directoryVisible: boolean("directory_visible").default(false).notNull(),
  createdAt: createdAt("created_at"),
  updatedAt: updatedAt("updated_at"),
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
