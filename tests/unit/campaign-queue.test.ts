import {describe, expect, it} from "vitest";

import {queueCampaign, type CampaignQueueMember} from "@/lib/admin/campaigns";
import type {AdminActor} from "@/lib/membership/lifecycle";

const actor = (): AdminActor => ({kind: "staff", userId: "staff-1", profileId: "staff-1"});
const input = {
  segmentId: "11111111-1111-4111-8111-111111111111",
  template: "renewal-reminder",
  localeStrategy: "profile" as const,
  idempotencyKey: "campaign-queue-fixture-key",
};

function fakeDependencies() {
  const recipients: unknown[] = [];
  const campaigns: Array<{campaignId: string; idempotencyKey: string}> = [];

  return {
    recipients,
    dependencies: {
      transaction: async <T>(callback: (store: unknown) => Promise<T>) => callback({}),
      getSavedSegment: async () => ({id: input.segmentId, ownerProfileId: "staff-1", filters: {tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null}}),
      membersForSegment: async (): Promise<readonly CampaignQueueMember[]> => [{profileId: "member-1", displayName: "Fixture Member", email: "member1@example.test", locale: "zh-HK", consentMarketing: true, suppressed: false, renewalAt: "2026-08-20"}],
      findCampaignByIdempotencyKey: async (_store: unknown, key: string) => {
        const campaign = campaigns.find((item) => item.idempotencyKey === key);
        return campaign ? {campaignId: campaign.campaignId, recipientCount: recipients.length} : null;
      },
      createCampaign: async (_store: unknown, _actor: unknown, campaign: {idempotencyKey: string}) => {
        const created = {campaignId: "campaign-1", idempotencyKey: campaign.idempotencyKey};
        campaigns.push(created);
        return {campaignId: created.campaignId, recipientCount: 0, disposition: "created" as const};
      },
      insertRecipients: async (_store: unknown, _campaignId: string, rows: readonly unknown[]) => { recipients.push(...rows); },
      appendAudit: async () => undefined,
    },
  };
}

describe("campaign queue", () => {
  it("freezes recipient identity, locale, and variables", async () => {
    const fake = fakeDependencies();

    await expect(queueCampaign(actor(), input, fake.dependencies)).resolves.toEqual({campaignId: "campaign-1", recipientCount: 1, disposition: "created"});
    expect(fake.recipients).toEqual([{
      profileId: "member-1",
      email: "member1@example.test",
      locale: "zh-HK",
      variables: {displayName: "Fixture Member", renewalDate: "2026-08-20"},
    }]);
  });

  it("returns the existing campaign for the same idempotency key", async () => {
    const fake = fakeDependencies();

    await queueCampaign(actor(), input, fake.dependencies);
    await expect(queueCampaign(actor(), input, fake.dependencies)).resolves.toEqual({campaignId: "campaign-1", recipientCount: 1, disposition: "existing"});
  });

  it("excludes members without consent, an email address, or an active suppression", async () => {
    const fake = fakeDependencies();
    fake.dependencies.membersForSegment = async (): Promise<readonly CampaignQueueMember[]> => [
      {profileId: "eligible", displayName: "Eligible", email: "eligible@example.test", locale: "en", consentMarketing: true, suppressed: false, renewalAt: null},
      {profileId: "no-consent", displayName: "No Consent", email: "no-consent@example.test", locale: "en", consentMarketing: false, suppressed: false, renewalAt: null},
      {profileId: "no-email", displayName: "No Email", email: null, locale: "en", consentMarketing: true, suppressed: false, renewalAt: null},
      {profileId: "suppressed", displayName: "Suppressed", email: "suppressed@example.test", locale: "en", consentMarketing: true, suppressed: true, renewalAt: null},
    ];

    await expect(queueCampaign(actor(), {...input, idempotencyKey: "campaign-queue-exclusion-key"}, fake.dependencies)).resolves.toEqual({campaignId: "campaign-1", recipientCount: 1, disposition: "created"});
    expect(fake.recipients).toEqual([{
      profileId: "eligible",
      email: "eligible@example.test",
      locale: "en",
      variables: {displayName: "Eligible", renewalDate: null},
    }]);
  });
});
