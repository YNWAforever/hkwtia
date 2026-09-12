-- Programme C-7 (migration 0034). Reference data, not fixture data: the registry must exist in
-- production, and `WOZTELL_APPROVED_TEMPLATE_KEYS` is the fallback only while it
-- is empty. Every row lands pending (the column default) so that seeding the
-- registry can never approve a template nobody approved — an unapproved key is
-- skipped at send time, not sent (S-14). Mirrored by
-- tests/fixtures/whatsapp-template-seed.ts, the way 0029 is mirrored by
-- tests/fixtures/company-slug.ts.
INSERT INTO "whatsapp_templates" ("key", "element_name", "language_code", "category", "variables") VALUES
  ('renewal_14', 'wtia_renewal_d14', 'en_US', 'utility', ARRAY['memberName','renewalDate','renewalUrl']),
  ('dunning_3', 'wtia_dunning_d3', 'en_US', 'utility', ARRAY['memberName','amountDue','paymentUrl']),
  ('concierge_follow_up_en', 'wtia_concierge_follow_up_en', 'en_US', 'utility', ARRAY['memberName','supportUrl']),
  ('concierge_follow_up_zh_hk', 'wtia_concierge_follow_up_zh_hk', 'zh_HK', 'utility', ARRAY['memberName','supportUrl']),
  ('event_reminder_24h', 'wtia_event_reminder_24h', 'en_US', 'utility', ARRAY['memberName','eventTitle','startsAt','eventUrl']),
  -- Programme B-5's bilingual counterpart: a zh-HK member's reminder email
  -- renders in Chinese, and the WhatsApp leg must match rather than default to
  -- English while this half stays unapproved (config/whatsapp-templates.ts).
  ('event_reminder_24h_zh_hk', 'wtia_event_reminder_24h_zh_hk', 'zh_HK', 'utility', ARRAY['memberName','eventTitle','startsAt','eventUrl']),
  -- §8.3's marketing templates. Without these the 'marketing' arm of
  -- whatsapp_templates_category_check is never exercised and the announcement
  -- blast /admin/campaigns exists for has no template to send.
  ('wtia_announcement_en', 'wtia_announcement_en', 'en_US', 'marketing', ARRAY['memberName','headline','detailUrl']),
  ('wtia_announcement_zh_hk', 'wtia_announcement_zh_hk', 'zh_HK', 'marketing', ARRAY['memberName','headline','detailUrl']),
  ('wtia_lead_followup_en', 'wtia_lead_followup_en', 'en_US', 'marketing', ARRAY['contactName','topic','replyUrl']),
  ('wtia_lead_followup_zh_hk', 'wtia_lead_followup_zh_hk', 'zh_HK', 'marketing', ARRAY['contactName','topic','replyUrl'])
ON CONFLICT ("key") DO NOTHING;
