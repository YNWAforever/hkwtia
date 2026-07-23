import {Pool} from "pg";

export const M2_REFERENCE_INSTANT = new Date("2026-07-21T00:00:00.000Z");
export const M2_AT_RISK_PROFILE_IDS = ["m2-risk-01", "m2-risk-02", "m2-risk-03"] as const;

type UserRole = "member" | "staff" | "exco" | "superadmin";
type MembershipStatus = "pending_payment" | "pending_review" | "active" | "past_due" | "cancel_at_period_end" | "cancelled" | "expired";
type BillingInterval = "annual" | "monthly" | "none";

function fixtureUuid(namespace: string, index: number): string {
  return `${namespace}000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

function atOffset(days: number, hours = 0): string {
  return new Date(M2_REFERENCE_INSTANT.getTime() + (days * 24 + hours) * 3_600_000).toISOString();
}

const memberProfileIds = [
  ...M2_AT_RISK_PROFILE_IDS,
  ...Array.from({length: 24}, (_, index) => `m2-member-${String(index + 4).padStart(2, "0")}`),
] as const;

export const M2_PROFILE_ROWS: readonly Readonly<{
  id: string;
  authUserId: string;
  email: string;
  role: UserRole;
  lastLoginAt: string | null;
  consentMarketing: boolean;
  interests: readonly string[];
  displayName: string;
  locale: "en" | "zh-HK";
}>[] = [
  ...memberProfileIds.map((id, index) => ({
    id,
    authUserId: `m2-auth-member-${String(index + 1).padStart(2, "0")}`,
    email: `${id}@m2.example.test`,
    role: "member" as const,
    lastLoginAt: id === "m2-risk-01" ? atOffset(-1) : id === "m2-risk-02" || id === "m2-risk-03" ? null : index % 5 === 0 ? null : atOffset(-(index + 1)),
    consentMarketing: index % 4 !== 0,
    interests: index % 3 === 0 ? ["ai", "events"] : index % 3 === 1 ? ["launch-pad"] : ["membership"],
    displayName: id.startsWith("m2-risk-") ? `M2 Risk ${id.slice(-2)}` : `M2 Member ${id.slice(-2)}`,
    locale: index % 2 === 0 ? "en" as const : "zh-HK" as const,
  })),
  {id: "m2-staff-01", authUserId: "m2-auth-staff-01", email: "staff-01@m2.example.test", role: "staff", lastLoginAt: atOffset(-1), consentMarketing: false, interests: ["operations"], displayName: "M2 Staff", locale: "en"},
  {id: "m2-exco-01", authUserId: "m2-auth-exco-01", email: "exco-01@m2.example.test", role: "exco", lastLoginAt: atOffset(-2), consentMarketing: false, interests: ["governance"], displayName: "M2 ExCo", locale: "zh-HK"},
  {id: "m2-superadmin-01", authUserId: "m2-auth-superadmin-01", email: "superadmin-01@m2.example.test", role: "superadmin", lastLoginAt: atOffset(-1), consentMarketing: false, interests: ["operations"], displayName: "M2 Superadmin", locale: "en"},
];

export const M2_UUIDS = {
  companies: Array.from({length: 12}, (_, index) => fixtureUuid("20", index + 1)),
  companyMembers: Array.from({length: 18}, (_, index) => fixtureUuid("21", index + 1)),
  applications: Array.from({length: 18}, (_, index) => fixtureUuid("22", index + 1)),
  memberships: Array.from({length: 18}, (_, index) => fixtureUuid("23", index + 1)),
  engagementEvents: Array.from({length: 8}, (_, index) => fixtureUuid("24", index + 1)),
  notes: Array.from({length: 4}, (_, index) => fixtureUuid("25", index + 1)),
  emails: Array.from({length: 6}, (_, index) => fixtureUuid("26", index + 1)),
  segments: Array.from({length: 2}, (_, index) => fixtureUuid("27", index + 1)),
  campaigns: [fixtureUuid("28", 1)],
  recipients: Array.from({length: 3}, (_, index) => fixtureUuid("29", index + 1)),
  events: Array.from({length: 4}, (_, index) => fixtureUuid("2a", index + 1)),
  approvals: Array.from({length: 2}, (_, index) => fixtureUuid("2b", index + 1)),
} as const;

export const M2_COMPANY_ROWS = M2_UUIDS.companies.map((id, index) => ({
  id,
  legalName: `M2 Fixture Company ${String(index + 1).padStart(2, "0")} Limited`,
  displayName: `M2 Company ${String(index + 1).padStart(2, "0")}`,
  website: `https://company-${String(index + 1).padStart(2, "0")}.m2.example.test`,
  industry: ["Artificial Intelligence", "Professional Services", "Technology", "Education"][index % 4]!,
  sizeBand: ["1-10", "11-50", "51-200"][index % 3]!,
  directoryVisible: index % 3 !== 0,
}));

const companyOwnerProfileIds = [...M2_AT_RISK_PROFILE_IDS, ...memberProfileIds.slice(3, 12)];
const extraCompanyProfileIds = memberProfileIds.slice(18, 24);
const companyMemberRows = [
  ...companyOwnerProfileIds.map((userId, index) => ({id: M2_UUIDS.companyMembers[index]!, companyId: M2_UUIDS.companies[index]!, userId, role: "owner" as const})),
  ...extraCompanyProfileIds.map((userId, index) => ({id: M2_UUIDS.companyMembers[index + 12]!, companyId: M2_UUIDS.companies[index + 3]!, userId, role: index % 2 === 0 ? "admin" as const : "member" as const})),
];

const applicationProfileIds = [...companyOwnerProfileIds, ...memberProfileIds.slice(12, 18)];
const planCodes = [
  "corporate", "corporate", "corporate", "corporate", "corporate", "corporate",
  "startup", "startup", "corporate", "patron", "corporate", "startup",
  "community", "startup", "startup", "patron", "community", "startup",
] as const;
const membershipStatuses: readonly MembershipStatus[] = [
  "active", "past_due", "active", "active", "active", "active",
  "active", "cancelled", "cancel_at_period_end", "pending_review", "active", "active",
  "active", "active", "past_due", "pending_review", "active", "active",
];
const billingIntervals: readonly BillingInterval[] = [
  "annual", "annual", "monthly", "annual", "monthly", "annual",
  "annual", "annual", "annual", "none", "annual", "monthly",
  "none", "annual", "annual", "none", "none", "monthly",
];
const julyApplicationIndexes = new Map<number, {createdAt: string; currentStep: "profile" | "review" | "complete"; status: "draft" | "pending_review" | "completed"}>([
  [0, {createdAt: "2026-07-02T04:00:00.000Z", currentStep: "complete", status: "completed"}],
  [1, {createdAt: "2026-07-03T04:00:00.000Z", currentStep: "complete", status: "completed"}],
  [7, {createdAt: "2026-07-04T04:00:00.000Z", currentStep: "complete", status: "completed"}],
  [9, {createdAt: "2026-07-05T04:00:00.000Z", currentStep: "review", status: "pending_review"}],
  [15, {createdAt: "2026-07-06T04:00:00.000Z", currentStep: "profile", status: "draft"}],
]);
const applicationRows = applicationProfileIds.map((applicantUserId, index) => {
  const reportFixture = julyApplicationIndexes.get(index);
  return {
    id: M2_UUIDS.applications[index]!,
    applicantUserId,
    planCode: planCodes[index]!,
    companyId: index < 12 ? M2_UUIDS.companies[index]! : null,
    currentStep: reportFixture?.currentStep ?? "complete",
    status: reportFixture?.status ?? "completed",
    createdAt: reportFixture?.createdAt ?? (index % 2 === 0 ? "2026-06-01T04:00:00.000Z" : "2026-08-05T04:00:00.000Z"),
  };
});

const renewalOffsets = [15, 30, 45, 120, 140, 90, 180, -30, 75, 120, 210, 150, 365, 200, 20, 120, 365, 240];
const membershipRows = applicationProfileIds.map((profileId, index) => ({
  id: M2_UUIDS.memberships[index]!,
  applicationId: M2_UUIDS.applications[index]!,
  ownerUserId: index < 12 ? null : profileId,
  companyId: index < 12 ? M2_UUIDS.companies[index]! : null,
  planCode: planCodes[index]!,
  status: membershipStatuses[index]!,
  billingInterval: billingIntervals[index]!,
  seatLimit: planCodes[index] === "corporate" ? 25 : planCodes[index] === "startup" ? 5 : 1,
  billingPeriodStart: atOffset(-320 - index),
  billingPeriodEnd: atOffset(renewalOffsets[index]!),
  cancelAtPeriodEnd: membershipStatuses[index] === "cancel_at_period_end",
}));

const engagementScoreRows = M2_PROFILE_ROWS.map((profile, index) => ({
  profileId: profile.id,
  score: profile.id === "m2-risk-01" ? 8 : profile.id === "m2-risk-02" ? 24 : profile.id === "m2-risk-03" ? 19 : profile.id === "m2-member-06" ? 10 : 25 + (index % 61),
  trend: (index % 9) - 4,
}));

const engagementEventRows = [
  {id: M2_UUIDS.engagementEvents[0]!, profileId: "m2-risk-01", companyId: M2_UUIDS.companies[0]!, type: "renewal_paid", points: 10, metadata: {membershipId: M2_UUIDS.memberships[0]!, periodStart: atOffset(-350), periodEnd: atOffset(15), renewalOrdinal: 1}, occurredAt: "2026-07-08T04:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[1]!, profileId: "m2-risk-02", companyId: M2_UUIDS.companies[1]!, type: "renewal_failed", points: -10, metadata: {membershipId: M2_UUIDS.memberships[1]!, periodStart: atOffset(-335), periodEnd: atOffset(30), renewalOrdinal: 1}, occurredAt: "2026-07-09T04:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[2]!, profileId: "m2-risk-03", companyId: M2_UUIDS.companies[2]!, type: "renewal_paid", points: 10, metadata: {membershipId: M2_UUIDS.memberships[2]!, periodStart: atOffset(-320), periodEnd: atOffset(45), renewalOrdinal: 2}, occurredAt: "2026-07-10T04:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[3]!, profileId: "m2-member-04", companyId: M2_UUIDS.companies[3]!, type: "renewal_failed", points: -10, metadata: {membershipId: M2_UUIDS.memberships[3]!, periodStart: atOffset(-245), periodEnd: atOffset(120), renewalOrdinal: 2}, occurredAt: "2026-07-11T04:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[4]!, profileId: "m2-risk-01", companyId: M2_UUIDS.companies[0]!, type: "event_attended", points: 5, metadata: {eventId: M2_UUIDS.events[0]!}, occurredAt: "2026-07-10T06:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[5]!, profileId: "m2-risk-03", companyId: M2_UUIDS.companies[2]!, type: "event_attended", points: 5, metadata: {eventId: M2_UUIDS.events[1]!}, occurredAt: "2026-07-15T06:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[6]!, profileId: "m2-member-14", companyId: null, type: "profile_completed", points: 3, metadata: {source: "fixture"}, occurredAt: "2026-06-15T04:00:00.000Z"},
  {id: M2_UUIDS.engagementEvents[7]!, profileId: "m2-member-18", companyId: null, type: "directory_viewed", points: 1, metadata: {source: "fixture"}, occurredAt: "2026-08-01T04:00:00.000Z"},
];

const eventRows = [
  {id: M2_UUIDS.events[0]!, slug: "m2-ai-showcase-briefing", titleEn: "M2 AI Showcase Briefing", titleZh: "M2 人工智能展示簡介會", descriptionEn: "Deterministic fixture event for the M2 demo.", descriptionZh: "M2 示範用固定測試活動。", startsAt: "2026-07-10T02:00:00.000Z", endsAt: "2026-07-10T06:00:00.000Z", venue: "M2 Fixture Hall", capacity: 40, memberOnly: false, published: true},
  {id: M2_UUIDS.events[1]!, slug: "m2-launch-pad-workshop", titleEn: "M2 Launch Pad Workshop", titleZh: "M2 Launch Pad 工作坊", descriptionEn: "Deterministic fixture workshop for members.", descriptionZh: "會員固定測試工作坊。", startsAt: "2026-07-15T02:00:00.000Z", endsAt: "2026-07-15T06:00:00.000Z", venue: "M2 Fixture Studio", capacity: 20, memberOnly: true, published: true},
  {id: M2_UUIDS.events[2]!, slug: "m2-ai-ops-open-lab", titleEn: "M2 AI-Ops Open Lab", titleZh: "M2 AI-Ops 開放實驗室", descriptionEn: "Deterministic future fixture event.", descriptionZh: "固定未來測試活動。", startsAt: "2026-07-25T02:00:00.000Z", endsAt: "2026-07-25T06:00:00.000Z", venue: "M2 Fixture Lab", capacity: 30, memberOnly: false, published: true},
  {id: M2_UUIDS.events[3]!, slug: "m2-exco-roundtable", titleEn: "M2 ExCo Roundtable", titleZh: "M2 執委會圓桌會議", descriptionEn: "Deterministic unpublished fixture event.", descriptionZh: "固定未發布測試活動。", startsAt: "2026-08-10T02:00:00.000Z", endsAt: "2026-08-10T06:00:00.000Z", venue: "M2 Fixture Boardroom", capacity: 12, memberOnly: true, published: false},
];

const eventRegistrationRows = [
  {eventId: M2_UUIDS.events[0]!, profileId: "m2-risk-01", status: "attended", checkedInAt: "2026-07-10T02:10:00.000Z"},
  {eventId: M2_UUIDS.events[0]!, profileId: "m2-risk-02", status: "no_show", checkedInAt: null},
  {eventId: M2_UUIDS.events[0]!, profileId: "m2-member-04", status: "registered", checkedInAt: null},
  {eventId: M2_UUIDS.events[0]!, profileId: "m2-member-05", status: "cancelled", checkedInAt: null},
  {eventId: M2_UUIDS.events[1]!, profileId: "m2-risk-01", status: "attended", checkedInAt: "2026-07-15T02:05:00.000Z"},
  {eventId: M2_UUIDS.events[1]!, profileId: "m2-risk-03", status: "attended", checkedInAt: "2026-07-15T02:08:00.000Z"},
  {eventId: M2_UUIDS.events[1]!, profileId: "m2-member-06", status: "no_show", checkedInAt: null},
  {eventId: M2_UUIDS.events[2]!, profileId: "m2-member-07", status: "registered", checkedInAt: null},
  {eventId: M2_UUIDS.events[2]!, profileId: "m2-member-08", status: "waitlist", checkedInAt: null},
];

const memberNoteRows = [
  {id: M2_UUIDS.notes[0]!, profileId: "m2-risk-01", authorProfileId: "m2-staff-01", body: "Fixture note: discuss renewal options at the next check-in.", createdAt: "2026-07-12T04:00:00.000Z"},
  {id: M2_UUIDS.notes[1]!, profileId: "m2-risk-02", authorProfileId: "m2-exco-01", body: "Fixture note: share the structured onboarding guide.", createdAt: "2026-07-13T04:00:00.000Z"},
  {id: M2_UUIDS.notes[2]!, profileId: "m2-member-14", authorProfileId: "m2-staff-01", body: "Fixture note: interested in the Launch Pad cohort.", createdAt: "2026-07-14T04:00:00.000Z"},
  {id: M2_UUIDS.notes[3]!, profileId: "m2-member-18", authorProfileId: "m2-superadmin-01", body: "Fixture note: demo record only.", createdAt: "2026-07-15T04:00:00.000Z"},
];

const emailRows = [
  {id: M2_UUIDS.emails[0]!, profileId: "m2-risk-01", template: "membership_welcome", subject: "M2 fixture welcome", status: "delivered", providerId: "m2-provider-01", createdAt: "2026-06-20T04:00:00.000Z"},
  {id: M2_UUIDS.emails[1]!, profileId: "m2-risk-01", template: "event_reminder", subject: "M2 fixture event reminder", status: "delivered", providerId: "m2-provider-02", createdAt: "2026-07-09T04:00:00.000Z"},
  {id: M2_UUIDS.emails[2]!, profileId: "m2-risk-02", template: "renewal_reminder", subject: "M2 fixture renewal reminder", status: "bounced", providerId: "m2-provider-03", createdAt: "2026-07-10T04:00:00.000Z"},
  {id: M2_UUIDS.emails[3]!, profileId: "m2-risk-03", template: "event_follow_up", subject: "M2 fixture event follow-up", status: "delivered", providerId: "m2-provider-04", createdAt: "2026-07-16T04:00:00.000Z"},
  {id: M2_UUIDS.emails[4]!, profileId: "m2-member-14", template: "launch_pad", subject: "M2 fixture Launch Pad update", status: "queued", providerId: null, createdAt: "2026-07-17T04:00:00.000Z"},
  {id: M2_UUIDS.emails[5]!, profileId: "m2-member-18", template: "membership_digest", subject: "M2 fixture membership digest", status: "failed", providerId: "m2-provider-06", createdAt: "2026-07-18T04:00:00.000Z"},
];

const canonicalFilters = {profileIds: [], tier: ["corporate"], status: ["active", "past_due"], scoreMin: null, scoreMax: 19.99, renewalWithinDays: 60, sector: "", lastLoginBeforeDays: null};
const savedSegmentRows = [
  {id: M2_UUIDS.segments[0]!, ownerProfileId: "m2-staff-01", nameEn: "M2 engineered at-risk", nameZh: "M2 固定風險會員", filterVersion: 1, filters: canonicalFilters},
  {id: M2_UUIDS.segments[1]!, ownerProfileId: "m2-exco-01", nameEn: "M2 AI interest", nameZh: "M2 人工智能興趣", filterVersion: 1, filters: {...canonicalFilters, tier: [], scoreMax: null, renewalWithinDays: null}},
];

const campaignRecipientRows = M2_AT_RISK_PROFILE_IDS.map((profileId, index) => ({
  id: M2_UUIDS.recipients[index]!, campaignId: M2_UUIDS.campaigns[0]!, profileId,
  email: `${profileId}@m2.example.test`, locale: index % 2 === 0 ? "en" : "zh-HK",
  variables: {displayName: `M2 Risk ${String(index + 1).padStart(2, "0")}`, renewalDate: atOffset((index + 1) * 15).slice(0, 10)},
}));

type SeedConnection = Readonly<{query: (text: string, values?: readonly unknown[]) => Promise<unknown>; release: () => void}>;
export type M2SeedPool = Readonly<{connect: () => Promise<SeedConnection>}>;

async function writeFixtures(connection: SeedConnection): Promise<void> {
  const plans = [
    ["community", "individual", "free", null, 0, 0, 1, true],
    ["startup", "startup", "checkout", null, 2400, 250, 5, true],
    ["corporate", "corporate", "checkout", null, 12000, 1200, 25, true],
    ["patron", "patron", "review", null, 36000, 3600, 1, true],
  ] as const;
  for (const row of plans) await connection.query(`
    INSERT INTO membership_plans (code, audience, billing_behavior, stripe_price_reference, annual_price_hkd, monthly_price_hkd, seat_allowance, active, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
    ON CONFLICT (code) DO UPDATE SET audience=EXCLUDED.audience, billing_behavior=EXCLUDED.billing_behavior,
      stripe_price_reference=EXCLUDED.stripe_price_reference, annual_price_hkd=EXCLUDED.annual_price_hkd,
      monthly_price_hkd=EXCLUDED.monthly_price_hkd, seat_allowance=EXCLUDED.seat_allowance,
      active=EXCLUDED.active, updated_at=EXCLUDED.updated_at
  `, [...row, "2026-01-01T00:00:00.000Z"]);

  for (const row of M2_PROFILE_ROWS) await connection.query(`
    INSERT INTO profiles (id,auth_user_id,email,role,last_login_at,consent_marketing,interests,display_name,phone,job_title,locale,onboarding_state,directory_visible,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,$9,$10,'complete',$11,$12,$12)
    ON CONFLICT (id) DO UPDATE SET auth_user_id=EXCLUDED.auth_user_id,email=EXCLUDED.email,role=EXCLUDED.role,
      last_login_at=EXCLUDED.last_login_at,consent_marketing=EXCLUDED.consent_marketing,interests=EXCLUDED.interests,
      display_name=EXCLUDED.display_name,job_title=EXCLUDED.job_title,locale=EXCLUDED.locale,
      onboarding_state=EXCLUDED.onboarding_state,directory_visible=EXCLUDED.directory_visible,updated_at=EXCLUDED.updated_at
  `, [row.id,row.authUserId,row.email,row.role,row.lastLoginAt,row.consentMarketing,[...row.interests],row.displayName,"M2 Fixture Role",row.locale,row.role === "member","2026-01-01T00:00:00.000Z"]);

  for (const row of M2_COMPANY_ROWS) await connection.query(`
    INSERT INTO companies (id,legal_name,display_name,website,industry,size_band,description,logo_reference,directory_visible,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$9)
    ON CONFLICT (id) DO UPDATE SET legal_name=EXCLUDED.legal_name,display_name=EXCLUDED.display_name,
      website=EXCLUDED.website,industry=EXCLUDED.industry,size_band=EXCLUDED.size_band,description=EXCLUDED.description,
      directory_visible=EXCLUDED.directory_visible,updated_at=EXCLUDED.updated_at
  `, [row.id,row.legalName,row.displayName,row.website,row.industry,row.sizeBand,"Deterministic M2 fixture company.",row.directoryVisible,"2026-01-01T00:00:00.000Z"]);

  for (const row of companyMemberRows) await connection.query(`
    INSERT INTO company_members (id,company_id,user_id,role,joined_at,revoked_at) VALUES ($1,$2,$3,$4,$5,NULL)
    ON CONFLICT (id) DO UPDATE SET company_id=EXCLUDED.company_id,user_id=EXCLUDED.user_id,role=EXCLUDED.role,joined_at=EXCLUDED.joined_at,revoked_at=NULL
  `, [row.id,row.companyId,row.userId,row.role,"2026-01-02T00:00:00.000Z"]);

  for (const row of applicationRows) await connection.query(`
    INSERT INTO membership_applications (id,applicant_user_id,plan_code,company_id,current_step,status,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$7)
    ON CONFLICT (id) DO UPDATE SET applicant_user_id=EXCLUDED.applicant_user_id,plan_code=EXCLUDED.plan_code,
      company_id=EXCLUDED.company_id,current_step=EXCLUDED.current_step,status=EXCLUDED.status,updated_at=EXCLUDED.updated_at
  `, [row.id,row.applicantUserId,row.planCode,row.companyId,row.currentStep,row.status,row.createdAt]);

  for (const row of membershipRows) await connection.query(`
    INSERT INTO memberships (id,owner_user_id,company_id,application_id,plan_code,status,billing_interval,seat_limit,
      stripe_customer_id,stripe_subscription_id,billing_period_start,billing_period_end,cancel_at_period_end,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,NULL,$9,$10,$11,$12,$12)
    ON CONFLICT (id) DO UPDATE SET owner_user_id=EXCLUDED.owner_user_id,company_id=EXCLUDED.company_id,
      application_id=EXCLUDED.application_id,plan_code=EXCLUDED.plan_code,status=EXCLUDED.status,
      billing_interval=EXCLUDED.billing_interval,seat_limit=EXCLUDED.seat_limit,billing_period_start=EXCLUDED.billing_period_start,
      billing_period_end=EXCLUDED.billing_period_end,cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=EXCLUDED.updated_at
  `, [row.id,row.ownerUserId,row.companyId,row.applicationId,row.planCode,row.status,row.billingInterval,row.seatLimit,row.billingPeriodStart,row.billingPeriodEnd,row.cancelAtPeriodEnd,"2026-01-03T00:00:00.000Z"]);

  for (const row of engagementScoreRows) await connection.query(`
    INSERT INTO engagement_scores (profile_id,score,trend,computed_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (profile_id) DO UPDATE SET score=EXCLUDED.score,trend=EXCLUDED.trend,computed_at=EXCLUDED.computed_at
  `, [row.profileId,row.score,row.trend,M2_REFERENCE_INSTANT.toISOString()]);

  for (const row of engagementEventRows) await connection.query(`
    INSERT INTO engagement_events (id,profile_id,company_id,type,points,metadata,occurred_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
    ON CONFLICT (id) DO NOTHING
  `, [row.id,row.profileId,row.companyId,row.type,row.points,JSON.stringify(row.metadata),row.occurredAt]);

  for (const row of memberNoteRows) await connection.query(`
    INSERT INTO member_notes (id,profile_id,author_profile_id,body,replaces_note_id,created_at) VALUES ($1,$2,$3,$4,NULL,$5)
    ON CONFLICT (id) DO NOTHING
  `, [row.id,row.profileId,row.authorProfileId,row.body,row.createdAt]);

  for (const row of emailRows) await connection.query(`
    INSERT INTO email_log (id,profile_id,template,subject,status,provider_id,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)
    ON CONFLICT (id) DO NOTHING
  `, [row.id,row.profileId,row.template,row.subject,row.status,row.providerId,row.createdAt]);

  for (const row of eventRows) await connection.query(`
    INSERT INTO events (id,slug,title_en,title_zh,description_en,description_zh,starts_at,ends_at,venue,capacity,member_only,published,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
    ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug,title_en=EXCLUDED.title_en,title_zh=EXCLUDED.title_zh,
      description_en=EXCLUDED.description_en,description_zh=EXCLUDED.description_zh,starts_at=EXCLUDED.starts_at,
      ends_at=EXCLUDED.ends_at,venue=EXCLUDED.venue,capacity=EXCLUDED.capacity,member_only=EXCLUDED.member_only,
      published=EXCLUDED.published,updated_at=EXCLUDED.updated_at
  `, [row.id,row.slug,row.titleEn,row.titleZh,row.descriptionEn,row.descriptionZh,row.startsAt,row.endsAt,row.venue,row.capacity,row.memberOnly,row.published,"2026-01-04T00:00:00.000Z"]);

  for (const row of eventRegistrationRows) await connection.query(`
    INSERT INTO event_registrations (event_id,profile_id,status,checked_in_at) VALUES ($1,$2,$3,$4)
    ON CONFLICT (event_id,profile_id) DO UPDATE SET status=EXCLUDED.status,checked_in_at=EXCLUDED.checked_in_at
  `, [row.eventId,row.profileId,row.status,row.checkedInAt]);

  for (const row of savedSegmentRows) await connection.query(`
    INSERT INTO saved_segments (id,owner_profile_id,name_en,name_zh,filter_version,filters,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$7)
    ON CONFLICT (id) DO UPDATE SET owner_profile_id=EXCLUDED.owner_profile_id,name_en=EXCLUDED.name_en,
      name_zh=EXCLUDED.name_zh,filter_version=EXCLUDED.filter_version,filters=EXCLUDED.filters,updated_at=EXCLUDED.updated_at
  `, [row.id,row.ownerProfileId,row.nameEn,row.nameZh,row.filterVersion,JSON.stringify(row.filters),"2026-01-05T00:00:00.000Z"]);

  await connection.query(`
    INSERT INTO campaigns (id,segment_id,created_by_profile_id,template,locale_strategy,status,idempotency_key,created_at)
    VALUES ($1,$2,$3,$4,'profile','queued',$5,$6)
    ON CONFLICT (id) DO UPDATE SET segment_id=EXCLUDED.segment_id,created_by_profile_id=EXCLUDED.created_by_profile_id,
      template=EXCLUDED.template,locale_strategy=EXCLUDED.locale_strategy,status=EXCLUDED.status,idempotency_key=EXCLUDED.idempotency_key
  `, [M2_UUIDS.campaigns[0],M2_UUIDS.segments[0],"m2-staff-01","membership_renewal","m2-seed-campaign-01","2026-07-18T04:00:00.000Z"]);

  for (const row of campaignRecipientRows) await connection.query(`
    INSERT INTO campaign_recipients (id,campaign_id,profile_id,email,locale,variables,status) VALUES ($1,$2,$3,$4,$5,$6::jsonb,'queued')
    ON CONFLICT (id) DO NOTHING
  `, [row.id,row.campaignId,row.profileId,row.email,row.locale,JSON.stringify(row.variables)]);

  const approvals = [
    {id: M2_UUIDS.approvals[0]!, actionType: "membership.patron_review", payload: {applicationId: M2_UUIDS.applications[9]!, fixture: true}, requestedByProfileId: "m2-staff-01", requestedAt: "2026-07-19T04:00:00.000Z"},
    {id: M2_UUIDS.approvals[1]!, actionType: "campaign.send", payload: {campaignId: M2_UUIDS.campaigns[0]!, template: "renewal-reminder"}, requestedByProfileId: "m2-exco-01", requestedAt: "2026-07-20T04:00:00.000Z"},
  ];
  for (const row of approvals) await connection.query(`
    INSERT INTO approvals (id,action_type,payload,status,requested_by_profile_id,requested_at,decided_by_profile_id,decided_at)
    VALUES ($1,$2,$3::jsonb,'pending',$4,$5,NULL,NULL)
    ON CONFLICT (id) DO UPDATE SET action_type=EXCLUDED.action_type,payload=EXCLUDED.payload,status=EXCLUDED.status,
      requested_by_profile_id=EXCLUDED.requested_by_profile_id,requested_at=EXCLUDED.requested_at,
      decided_by_profile_id=NULL,decided_at=NULL
  `, [row.id,row.actionType,JSON.stringify(row.payload),row.requestedByProfileId,row.requestedAt]);
}

export async function seedM2(pool: M2SeedPool): Promise<void> {
  const connection = await pool.connect();
  try {
    await connection.query("BEGIN");
    await writeFixtures(connection);
    await connection.query("COMMIT");
  } catch (error) {
    try { await connection.query("ROLLBACK"); } catch { /* Preserve the fixture write error. */ }
    throw error;
  } finally {
    connection.release();
  }
}

export async function runM2Seed(environment: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = environment.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required to seed M2 fixtures.");
  const pool = new Pool({connectionString: databaseUrl});
  try {
    await seedM2(pool);
  } finally {
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("seed-m2.ts")) {
  runM2Seed().catch(() => {
    console.error("M2 database seed failed.");
    process.exitCode = 1;
  });
}
