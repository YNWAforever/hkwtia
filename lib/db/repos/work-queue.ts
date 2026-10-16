import "server-only";
import { SUPPORT_NEXT_ACTIONS } from "@/lib/admin/support-followup-types";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/authorize";
import { getDb } from "@/lib/db/repos/common";
import { decodeScopedCursor, encodeScopedCursor } from "@/lib/admin/pagination";
import { AT_RISK_RENEWAL_DAYS, AT_RISK_DAY_MS } from "@/lib/admin/at-risk";
import type { Actor } from "@/lib/membership/lifecycle";
export const WORK_KINDS = [
  "application",
  "renewal",
  "payment",
  "support",
  "content",
] as const;
export const WORK_ACTIONS = [
  ...SUPPORT_NEXT_ACTIONS,
  "open_case",
  "contact_applicant",
  "await_documents",
  "review_ready",
  "await_payment",
  "support_reconciliation",
  "review_renewal",
  "open_conversation",
  "review_task",
  "edit_content",
  "edit_private_copy",
] as const;
export type WorkQueueItem = Readonly<{
  id: string;
  kind: (typeof WORK_KINDS)[number];
  summary: string;
  ownerProfileId: string | null;
  ownerName: string | null;
  dueAt: string | null;
  nextActionCode: (typeof WORK_ACTIONS)[number];
  href: string;
  priority: "high" | "normal";
  sourceStatus: string;
}>;
export const workQueueQuerySchema = z
  .object({
    scope: z.enum(["mine", "unassigned", "all"]),
    cursor: z.string().max(1000).nullable(),
  })
  .strict();
const rowSchema = z.object({
  id: z.string(),
  kind: z.enum(WORK_KINDS),
  summary: z.string(),
  owner_profile_id: z.string().nullable(),
  owner_name: z.string().nullable(),
  due_at: z.coerce.date().nullable(),
  next_action: z.enum(WORK_ACTIONS),
  href: z.string().startsWith("/admin/"),
  source_status: z.string(),
  sort_at: z.string().max(100),
});
type WorkDatabase = Readonly<{
  execute: (statement: SQL) => PromiseLike<unknown>;
}>;
function rows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (
    value &&
    typeof value === "object" &&
    "rows" in value &&
    Array.isArray(value.rows)
  )
    return value.rows;
  throw Error("WORK_QUEUE_READ_FAILED");
}
/** Read model only: ownership and financial/membership truth remain in existing records. */
export function createWorkQueueRepository(
  load: () => Promise<WorkDatabase> = getDb,
) {
  async function listMyWork(
    actor: Actor,
    input: z.infer<typeof workQueueQuerySchema>,
    asOf: Date = new Date(),
  ): Promise<{ items: readonly WorkQueueItem[]; nextCursor: string | null }> {
    requireAdmin(actor);
    const query = workQueueQuerySchema.parse(input);
    if (!Number.isFinite(asOf.getTime())) throw Error("INVALID_WORK_CLOCK");
    const includePrivate = process.env.CMS_SERVER_DRAFTS_ENABLED === "true";
    const scope = `work:v1:${actor.kind}:${actor.profileId}:${query.scope}:${includePrivate ? 1 : 0}`;
    const key = query.cursor ? decodeScopedCursor(scope, query.cursor) : null;
    if (
      key &&
      (!Number.isFinite(Date.parse(key[0])) ||
        !WORK_KINDS.includes(key[1] as (typeof WORK_KINDS)[number]) ||
        !key[2])
    )
      throw Error("INVALID_CURSOR");
    const limit = 20,
      renewalBefore = new Date(
        asOf.getTime() + AT_RISK_RENEWAL_DAYS * AT_RISK_DAY_MS,
      );
    const caseOwner = sql`NULLIF(task.context->>'ownerProfileId','')`;
    const caseDue = sql`NULLIF(task.context->>'dueAt','')::timestamptz`;
    const caseAction = sql`CASE WHEN task.context->>'nextActionCode' IN ('contact_applicant','await_documents','review_ready','await_payment','support_reconciliation') THEN task.context->>'nextActionCode' ELSE 'open_case' END`;
    const privateCopy = includePrivate
      ? sql`UNION ALL
    SELECT 'content:'||d.id::text,'content',d.namespace,d.owner_profile_id,NULL::timestamptz,d.created_at,'edit_private_copy','/admin/page-copy/'||d.namespace,'draft'
    FROM page_copy_drafts d WHERE d.published_at IS NULL AND d.owner_profile_id=${actor.profileId}`
      : sql``;
    const ownership =
      query.scope === "mine"
        ? sql`work.owner_profile_id=${actor.profileId}`
        : query.scope === "unassigned"
          ? sql`work.owner_profile_id IS NULL`
          : sql`TRUE`;
    const after = key
      ? sql`AND (work.sort_at,work.kind,work.id)>(${key[0]}::timestamptz,${key[1]},${key[2]})`
      : sql``;
    const result = await (
      await load()
    ).execute(sql`
   WITH source(id,kind,summary,owner_profile_id,due_at,created_at,next_action,href,source_status) AS (
    SELECT 'application:'||app.id::text,'application',p.display_name,${caseOwner},${caseDue},app.created_at,${caseAction},'/admin/members/queue/'||app.id::text,app.status::text
    FROM membership_applications app JOIN profiles p ON p.id=app.applicant_user_id
    LEFT JOIN staff_tasks task ON task.dedupe_key='membership-application:'||app.id::text AND task.kind='membership_application'
    WHERE app.status IN ('draft','pending_review')
    UNION ALL
    SELECT 'payment:'||app.id::text,'payment',p.display_name,${caseOwner},${caseDue},app.created_at,
     CASE WHEN attempt.state='completed' AND m.status='pending_payment' THEN 'support_reconciliation' ELSE 'await_payment' END,
     '/admin/members/queue/'||app.id::text,app.status::text
    FROM membership_applications app JOIN profiles p ON p.id=app.applicant_user_id
    LEFT JOIN staff_tasks task ON task.dedupe_key='membership-application:'||app.id::text AND task.kind='membership_application'
    LEFT JOIN memberships m ON m.application_id=app.id
    LEFT JOIN LATERAL(SELECT state FROM billing_attempts WHERE membership_id=m.id ORDER BY attempt_number DESC,id DESC LIMIT 1) attempt ON TRUE
    WHERE app.status='pending_payment'
    UNION ALL
    SELECT 'renewal:'||m.id::text,'renewal',coalesce(c.display_name,p.display_name,''),op.owner_profile_id,m.billing_period_end,m.created_at,'review_renewal',
     CASE WHEN p.id IS NOT NULL THEN '/admin/members/'||p.id ELSE '/admin/members?companyId='||m.company_id::text END,m.status::text
    FROM memberships m LEFT JOIN companies c ON c.id=m.company_id
    LEFT JOIN membership_applications app ON app.id=m.application_id
    LEFT JOIN profiles p ON p.id=coalesce(m.owner_user_id,app.applicant_user_id)
    LEFT JOIN member_operations_metadata op ON op.profile_id=p.id
    WHERE m.status IN ('active','past_due') AND m.cancel_at_period_end=false AND m.billing_interval<>'none'
     AND m.grant_effective_at IS NULL AND m.grant_expires_at IS NULL
     AND m.billing_period_end>=${asOf} AND m.billing_period_end<=${renewalBefore}
    UNION ALL
    SELECT 'support:'||c.id::text,'support',coalesce(p.display_name,''),c.assigned_to_profile_id,NULLIF(f.context->>'dueAt','')::timestamptz,c.created_at,coalesce(f.context->>'nextActionCode','open_conversation'),'/admin/inbox/'||c.id::text,'human'
    FROM conversations c LEFT JOIN profiles p ON p.id=c.profile_id LEFT JOIN staff_tasks f ON f.kind='support_followup' AND f.dedupe_key='support-followup:'||c.id::text WHERE c.handling='human' AND c.status='active'
    UNION ALL
    SELECT 'support:'||t.id::text,'support',coalesce(p.display_name,''),NULLIF(t.context->>'ownerProfileId',''),NULLIF(t.context->>'dueAt','')::timestamptz,t.created_at,'review_task','/admin/tasks','open'
    FROM staff_tasks t LEFT JOIN profiles p ON p.id=t.profile_id WHERE t.status='open' AND t.kind<>'membership_application'
     AND NOT EXISTS(SELECT 1 FROM conversations c WHERE c.id::text=t.context->>'conversationId' AND c.handling='human' AND c.status='active')
    UNION ALL
    SELECT 'content:'||p.id::text,'content',p.title_en,NULL::text,NULL::timestamptz,p.created_at,'edit_content',CASE WHEN p.kind='news' THEN '/admin/news' ELSE '/admin/announcements' END,'draft'
    FROM posts p WHERE p.published_at IS NULL AND p.archived_at IS NULL
    ${privateCopy}
   ),work AS(SELECT source.*,coalesce(due_at,created_at) AS sort_at FROM source)
   SELECT work.id,kind,summary,work.owner_profile_id,owner.display_name AS owner_name,due_at,next_action,href,source_status,sort_at::text
   FROM work LEFT JOIN profiles owner ON owner.id=work.owner_profile_id
   WHERE ${ownership} ${after} ORDER BY work.sort_at,work.kind,work.id LIMIT ${limit + 1}`);
    const found = z.array(rowSchema).parse(rows(result)),
      page = found.slice(0, limit),
      last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.id,
        kind: row.kind,
        summary: row.summary,
        ownerProfileId: row.owner_profile_id,
        ownerName: row.owner_name,
        dueAt: row.due_at?.toISOString() ?? null,
        nextActionCode: row.next_action,
        href:
          row.href.startsWith("/admin/members/") &&
          !row.href.startsWith("/admin/members/queue/")
            ? "/admin/members/" +
              encodeURIComponent(row.href.slice("/admin/members/".length))
            : row.href.startsWith("/admin/page-copy/")
              ? "/admin/page-copy/" +
                encodeURIComponent(row.href.slice("/admin/page-copy/".length))
              : row.href,
        priority: row.due_at && row.due_at <= asOf ? "high" : "normal",
        sourceStatus: row.source_status,
      })),
      nextCursor:
        found.length > limit && last
          ? encodeScopedCursor(scope, [last.sort_at, last.kind, last.id])
          : null,
    };
  }
  async function getMemberMaintenance(
    actor: Actor,
    profileId: string,
    membershipId: string | null,
  ) {
    requireAdmin(actor);
    const target = z.string().min(1).max(200).parse(profileId),
      membership = z.string().uuid().nullable().parse(membershipId);
    const result = await (
      await load()
    )
      .execute(sql`SELECT p.auth_user_id IS NOT NULL AND p.auth_user_id<>'' AS linked,
     owner.display_name AS owner_name,app.id::text AS application_id,
     CASE WHEN task.context->>'nextActionCode' IN ('contact_applicant','await_documents','review_ready','await_payment','support_reconciliation','follow_up_complete') THEN task.context->>'nextActionCode'
      WHEN app.status='pending_payment' THEN 'await_payment' WHEN app.status IN ('draft','pending_review') THEN 'open_case' ELSE 'none' END AS next_action,
     NULLIF(task.context->>'dueAt','')::timestamptz AS due_at,attempt.state::text AS payment_state
     FROM profiles p LEFT JOIN member_operations_metadata op ON op.profile_id=p.id
     LEFT JOIN LATERAL(SELECT id,status FROM membership_applications WHERE applicant_user_id=p.id ORDER BY created_at DESC,id DESC LIMIT 1) app ON TRUE
     LEFT JOIN staff_tasks task ON task.dedupe_key='membership-application:'||app.id::text AND task.kind='membership_application'
     LEFT JOIN profiles owner ON owner.id=coalesce(NULLIF(task.context->>'ownerProfileId',''),op.owner_profile_id)
     LEFT JOIN LATERAL(SELECT b.state FROM billing_attempts b JOIN memberships m ON m.id=b.membership_id
      WHERE m.id=${membership}::uuid AND (m.owner_user_id=p.id OR EXISTS(SELECT 1 FROM company_members cm WHERE cm.company_id=m.company_id AND cm.user_id=p.id AND cm.revoked_at IS NULL))
      ORDER BY b.attempt_number DESC,b.id DESC LIMIT 1) attempt ON TRUE WHERE p.id=${target} LIMIT 1`);
    const row = z
      .array(
        z.object({
          linked: z.boolean(),
          owner_name: z.string().nullable(),
          application_id: z.string().uuid().nullable(),
          next_action: z.enum([...WORK_ACTIONS, "none", "follow_up_complete"]),
          due_at: z.coerce.date().nullable(),
          payment_state: z
            .enum(["active", "completed", "abandoned", "expired"])
            .nullable(),
        }),
      )
      .parse(rows(result))[0];
    return row
      ? {
          hasLinkedSubject: row.linked,
          ownerName: row.owner_name,
          applicationId: row.application_id,
          nextActionCode: row.next_action,
          dueAt: row.due_at?.toISOString() ?? null,
          paymentAttemptState: row.payment_state,
        }
      : null;
  }
  return { listMyWork, getMemberMaintenance };
}
export const workQueueRepository = createWorkQueueRepository();
export const listMyWork = workQueueRepository.listMyWork;

export type MemberMaintenance = NonNullable<
  Awaited<ReturnType<typeof workQueueRepository.getMemberMaintenance>>
>;
