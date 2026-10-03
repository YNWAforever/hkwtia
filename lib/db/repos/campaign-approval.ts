import "server-only";
import {createHash} from "node:crypto";
import {campaignTemplateMap} from "@/lib/admin/campaign-email-templates";
import en from "@/messages/en.json";
import zhHK from "@/messages/zh-HK.json";
import {sql, type SQL} from "drizzle-orm";

const emailContentVersion = createHash("sha256").update(JSON.stringify({renderer: "campaign-email-v1", map: campaignTemplateMap, en: en.Email, zhHK: zhHK.Email})).digest("hex");

/** Snapshot content only. Delivery state is mutable; send-time consent remains fresh. */
export function campaignReviewRevisionSql(campaign: SQL): SQL<string> {
  return sql<string>`encode(sha256(convert_to(jsonb_build_object(
    'emailContentVersion', ${emailContentVersion}::text,
    'registeredTemplate', (SELECT jsonb_build_object(
      'element', t.element_name, 'language', t.language_code, 'category', t.category,
      'variables', t.variables, 'previews', t.previews, 'status', t.status, 'approvedAt', t.approved_at
    ) FROM whatsapp_templates t WHERE t.key = ${campaign}.template_key),
    'name', ${campaign}.name, 'channel', ${campaign}.channel,
    'template', ${campaign}.template, 'templateKey', ${campaign}.template_key,
    'variables', ${campaign}.variables_template, 'localeStrategy', ${campaign}.locale_strategy,
    'segmentId', ${campaign}.segment_id,
    'recipients', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'profileId', r.profile_id, 'contactId', r.contact_id,
      'email', r.email, 'number', r.whatsapp_number, 'locale', r.locale,
      'variables', r.variables, 'blockedReason', r.blocked_reason
    ) ORDER BY r.id) FROM campaign_recipients r WHERE r.campaign_id = ${campaign}.id), '[]'::jsonb)
  )::text, 'UTF8')), 'hex')`;
}

/** Reuse immutable approval audits. Historical rows are never auto-approved. */
export function currentCampaignApprovalSql(campaign: SQL): SQL {
  return sql`${campaign}.reviewed_at IS NOT NULL
    AND ${campaign}.rejection_reason IS NULL
    AND ${campaign}.reviewed_by_profile_id <> ${campaign}.created_by_profile_id
    AND EXISTS (SELECT 1 FROM audit_events approval
      WHERE approval.target_type = 'campaign' AND approval.target_id = ${campaign}.id::text
        AND approval.action = 'campaign.review.approved'
        AND approval.actor_user_id = ${campaign}.reviewed_by_profile_id
        AND approval.created_at >= ${campaign}.reviewed_at
        AND approval.metadata->>'reviewRevision' = ${campaignReviewRevisionSql(campaign)})`;
}
