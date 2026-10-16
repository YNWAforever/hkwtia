import "server-only";

export const campaignTemplateMap = {
  "renewal-reminder": "campaign_generic",
  "member-update": "campaign_generic",
  "membership_renewal": "campaign_generic",
  "batch-renewal-reminder": "batch_membership_renewal",
  "batch-profile-update": "batch_profile_update",
} as const;
export type CampaignSourceTemplate = keyof typeof campaignTemplateMap;
