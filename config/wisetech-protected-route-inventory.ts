import {nextAppRouteFileConvention} from "@/lib/integration/next-route-file-conventions";

export const protectedRouteFamilies = ["admin", "api"] as const;
export const protectedRouteClassifications = [
  "admin-page",
  "api-handler",
  "webhook-handler",
  "job-handler",
] as const;

export type ProtectedRouteFamily = (typeof protectedRouteFamilies)[number];
export type ProtectedRouteClassification = (typeof protectedRouteClassifications)[number];

export type ProtectedRouteOwner = Readonly<{
  id: string;
  family: ProtectedRouteFamily;
  classification: ProtectedRouteClassification;
  routePath: string;
  filePath: string;
  dataOwner: string;
  masterFamilyPattern: "/admin/*" | "/api/*";
  familyEvidence: "master-plan";
  routeEvidence: "hkwtia-repository";
}>;

export const protectedRouteConventions = Object.freeze([
  Object.freeze({
    family: "admin" as const,
    sourcePattern: "/admin/*" as const,
    convention: nextAppRouteFileConvention("page"),
    evidence: "master-plan" as const,
  }),
  Object.freeze({
    family: "api" as const,
    sourcePattern: "/api/*" as const,
    convention: nextAppRouteFileConvention("route"),
    evidence: "master-plan" as const,
  }),
]);

function owner(
  value: Omit<ProtectedRouteOwner, "masterFamilyPattern" | "familyEvidence" | "routeEvidence">,
): ProtectedRouteOwner {
  return Object.freeze({
    ...value,
    masterFamilyPattern: value.family === "admin" ? "/admin/*" : "/api/*",
    familyEvidence: "master-plan",
    routeEvidence: "hkwtia-repository",
  });
}

export const protectedRouteOwnershipInventory: readonly ProtectedRouteOwner[] = Object.freeze([
  owner({id: "admin-approvals", family: "admin", classification: "admin-page", routePath: "/admin/approvals", filePath: "app/[locale]/(admin)/admin/approvals/page.tsx", dataOwner: "Staff approval queue and audited approval actions."}),
  owner({id: "admin-at-risk", family: "admin", classification: "admin-page", routePath: "/admin/at-risk", filePath: "app/[locale]/(admin)/admin/at-risk/page.tsx", dataOwner: "Staff retention-risk read model."}),
  owner({id: "admin-automations", family: "admin", classification: "admin-page", routePath: "/admin/automations", filePath: "app/[locale]/(admin)/admin/automations/page.tsx", dataOwner: "Staff automation controls and audit rules."}),
  owner({id: "admin-cohort-detail", family: "admin", classification: "admin-page", routePath: "/admin/cohorts/[id]", filePath: "app/[locale]/(admin)/admin/cohorts/[id]/page.tsx", dataOwner: "Cohort CMS record selected by id."}),
  owner({id: "admin-cohorts", family: "admin", classification: "admin-page", routePath: "/admin/cohorts", filePath: "app/[locale]/(admin)/admin/cohorts/page.tsx", dataOwner: "Cohort CMS list and publication state."}),
  owner({id: "admin-event-detail", family: "admin", classification: "admin-page", routePath: "/admin/events-mgmt/[id]", filePath: "app/[locale]/(admin)/admin/events-mgmt/[id]/page.tsx", dataOwner: "Event CMS record selected by id."}),
  owner({id: "admin-events", family: "admin", classification: "admin-page", routePath: "/admin/events-mgmt", filePath: "app/[locale]/(admin)/admin/events-mgmt/page.tsx", dataOwner: "Event CMS list and publication state."}),
  owner({id: "admin-listings-review", family: "admin", classification: "admin-page", routePath: "/admin/listings-review", filePath: "app/[locale]/(admin)/admin/listings-review/page.tsx", dataOwner: "Staff showcase review workflow."}),
  owner({id: "admin-media-detail", family: "admin", classification: "admin-page", routePath: "/admin/media/[id]", filePath: "app/[locale]/(admin)/admin/media/[id]/page.tsx", dataOwner: "Curated media record selected by id."}),
  owner({id: "admin-media", family: "admin", classification: "admin-page", routePath: "/admin/media", filePath: "app/[locale]/(admin)/admin/media/page.tsx", dataOwner: "Curated media registry."}),
  owner({id: "admin-member-detail", family: "admin", classification: "admin-page", routePath: "/admin/members/[id]", filePath: "app/[locale]/(admin)/admin/members/[id]/page.tsx", dataOwner: "Member 360 record selected by id."}),
  owner({id: "admin-members", family: "admin", classification: "admin-page", routePath: "/admin/members", filePath: "app/[locale]/(admin)/admin/members/page.tsx", dataOwner: "Staff member CRM list."}),
  owner({id: "admin-news-detail", family: "admin", classification: "admin-page", routePath: "/admin/news/[id]", filePath: "app/[locale]/(admin)/admin/news/[id]/page.tsx", dataOwner: "News CMS record selected by id."}),
  owner({id: "admin-news", family: "admin", classification: "admin-page", routePath: "/admin/news", filePath: "app/[locale]/(admin)/admin/news/page.tsx", dataOwner: "News CMS list and publication state."}),
  owner({id: "admin-page-copy-namespace", family: "admin", classification: "admin-page", routePath: "/admin/page-copy/[namespace]", filePath: "app/[locale]/(admin)/admin/page-copy/[namespace]/page.tsx", dataOwner: "Allowlisted bilingual page-copy namespace."}),
  owner({id: "admin-page-copy", family: "admin", classification: "admin-page", routePath: "/admin/page-copy", filePath: "app/[locale]/(admin)/admin/page-copy/page.tsx", dataOwner: "Allowlisted page-copy namespace index."}),
  owner({id: "admin-home", family: "admin", classification: "admin-page", routePath: "/admin", filePath: "app/[locale]/(admin)/admin/page.tsx", dataOwner: "Staff-authorised CMS and CRM entry point."}),
  owner({id: "admin-board-draft-detail", family: "admin", classification: "admin-page", routePath: "/admin/reports/board-drafts/[id]", filePath: "app/[locale]/(admin)/admin/reports/board-drafts/[id]/page.tsx", dataOwner: "Board-report draft selected by id."}),
  owner({id: "admin-reports", family: "admin", classification: "admin-page", routePath: "/admin/reports", filePath: "app/[locale]/(admin)/admin/reports/page.tsx", dataOwner: "Staff reporting surfaces."}),
  owner({id: "admin-segments", family: "admin", classification: "admin-page", routePath: "/admin/segments", filePath: "app/[locale]/(admin)/admin/segments/page.tsx", dataOwner: "Staff segmentation controls."}),

  owner({id: "api-admin-segment-export", family: "api", classification: "api-handler", routePath: "/api/admin/segments/[id]/export", filePath: "app/api/admin/segments/[id]/export/route.ts", dataOwner: "Authorised segment export handler."}),
  owner({id: "api-ai-concierge", family: "api", classification: "api-handler", routePath: "/api/ai/concierge", filePath: "app/api/ai/concierge/route.ts", dataOwner: "Guarded Concierge conversation action."}),
  owner({id: "api-ai-conversation-feedback", family: "api", classification: "api-handler", routePath: "/api/ai/conversations/[id]/feedback", filePath: "app/api/ai/conversations/[id]/feedback/route.ts", dataOwner: "Conversation feedback action selected by id."}),
  owner({id: "api-auth-catch-all", family: "api", classification: "api-handler", routePath: "/api/auth/[...path]", filePath: "app/api/auth/[...path]/route.ts", dataOwner: "Neon Auth catch-all handler."}),
  owner({id: "api-showcase-view", family: "api", classification: "api-handler", routePath: "/api/showcase/[slug]/view", filePath: "app/api/showcase/[slug]/view/route.ts", dataOwner: "Published showcase view recording."}),
  owner({id: "api-unsubscribe", family: "api", classification: "api-handler", routePath: "/api/unsubscribe", filePath: "app/api/unsubscribe/route.ts", dataOwner: "Signed suppression action."}),

  owner({id: "api-stripe-webhook", family: "api", classification: "webhook-handler", routePath: "/api/stripe/webhook", filePath: "app/api/stripe/webhook/route.ts", dataOwner: "Stripe webhook verification and idempotent lifecycle processing."}),
  owner({id: "api-woztell-webhook", family: "api", classification: "webhook-handler", routePath: "/api/webhooks/woztell", filePath: "app/api/webhooks/woztell/route.ts", dataOwner: "WOZTELL webhook verification and lifecycle processing."}),

  owner({id: "api-job-aiops-metrics", family: "api", classification: "job-handler", routePath: "/api/jobs/aiops-metrics", filePath: "app/api/jobs/aiops-metrics/route.ts", dataOwner: "Authenticated AI-Ops metrics materialisation job."}),
  owner({id: "api-job-approvals-expirer", family: "api", classification: "job-handler", routePath: "/api/jobs/approvals-expirer", filePath: "app/api/jobs/approvals-expirer/route.ts", dataOwner: "Authenticated approval-expiry job."}),
  owner({id: "api-job-board-reporter", family: "api", classification: "job-handler", routePath: "/api/jobs/board-reporter", filePath: "app/api/jobs/board-reporter/route.ts", dataOwner: "Authenticated board-report generation job."}),
  owner({id: "api-job-chat-retention", family: "api", classification: "job-handler", routePath: "/api/jobs/chat-retention", filePath: "app/api/jobs/chat-retention/route.ts", dataOwner: "Authenticated chat-retention job."}),
  owner({id: "api-job-engagement-score", family: "api", classification: "job-handler", routePath: "/api/jobs/engagement-score", filePath: "app/api/jobs/engagement-score/route.ts", dataOwner: "Authenticated engagement-score job."}),
  owner({id: "api-job-journey-runner", family: "api", classification: "job-handler", routePath: "/api/jobs/journey-runner", filePath: "app/api/jobs/journey-runner/route.ts", dataOwner: "Authenticated lifecycle journey runner."}),
  owner({id: "api-job-renewal-runner", family: "api", classification: "job-handler", routePath: "/api/jobs/renewal-runner", filePath: "app/api/jobs/renewal-runner/route.ts", dataOwner: "Authenticated renewal runner."}),
  owner({id: "api-job-retention-analyst", family: "api", classification: "job-handler", routePath: "/api/jobs/retention-analyst", filePath: "app/api/jobs/retention-analyst/route.ts", dataOwner: "Authenticated retention-analysis job."}),
  owner({id: "api-job-worker-alert", family: "api", classification: "job-handler", routePath: "/api/jobs/worker-alert", filePath: "app/api/jobs/worker-alert/route.ts", dataOwner: "Authenticated worker-alert delivery job."}),
]);
