import {describe, expect, it, vi} from "vitest";

import type {CampaignRecord} from "@/lib/admin/campaigns";
import {
  approveCampaign,
  rejectCampaign,
  submitCampaignForReview,
} from "@/lib/admin/campaign-review-core";
import {
  CAMPAIGN_WIZARD_STEPS,
  campaignDraftKey,
  createCampaignDraft,
  nextWizardStep,
  parseCampaignWizardQuery,
  previousWizardStep,
  resolveWizardStep,
  visibleWizardSteps,
  wizardBlockingStep,
} from "@/lib/admin/campaign-wizard";
import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";
import type {AdminActor} from "@/lib/membership/lifecycle";

/**
 * Phase C2 Task 9. The wizard's input contracts and the review lifecycle it
 * hands a campaign to.
 *
 * Every case here asserts on what reaches the database as much as on what comes
 * back: a draft that is refused has to be refused BEFORE `createCampaign`, or
 * the refusal is a 23514 from a CHECK constraint arriving as a 500 on "Create
 * draft" with nothing a staff member can act on.
 */
const creator: AdminActor = {kind: "staff", userId: "admin-a", profileId: "admin-a"};
const draftId = "11111111-1111-4111-8111-111111111111";
const segmentId = "22222222-2222-4222-8222-222222222222";
const campaignId = "33333333-3333-4333-8333-333333333333";

function facts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    kind: "member",
    id: "member-1",
    displayName: "Ada Lovelace",
    email: "ada@example.com",
    whatsappNumber: "+85290000001",
    locale: "en",
    membershipStatus: "active",
    planCode: "corporate",
    renewalAt: new Date("2026-12-01T00:00:00.000Z"),
    marketingConsent: true,
    whatsappOptIn: true,
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    whatsappSuppressed: false,
    ...overrides,
  };
}

function templateRecord(status: "pending" | "approved" = "approved") {
  return {
    key: "wtia_announcement_en",
    elementName: "wtia_announcement_en",
    languageCode: "en_US",
    category: "marketing" as const,
    variables: ["memberName", "headline", "detailUrl"],
    previews: {},
    status,
    approvedAt: status === "approved" ? new Date("2026-09-01T00:00:00.000Z") : null,
    reviewedByProfileId: null,
    rejectionReason: null,
  };
}

function wizardDependencies(audience: readonly RecipientFacts[] = [facts()], status: "pending" | "approved" = "approved") {
  // `unknown[]` parameters rather than the repository's own signatures: these
  // fakes are asserted on positionally, and typing them narrowly would only move
  // the cast from the assertion to the declaration.
  const calls = {
    createCampaign: vi.fn(async (..._args: unknown[]) => ({campaignId, recipientCount: 0, disposition: "created" as const})),
    insertRecipients: vi.fn(async (..._args: unknown[]) => ({inserted: 1, skipped: 0})),
    appendAudit: vi.fn(async (..._args: unknown[]) => undefined),
    findCampaignByIdempotencyKey: vi.fn(async (..._args: unknown[]) => null as Readonly<{campaignId: string; recipientCount: number}> | null),
  };
  return {
    calls,
    dependencies: {
      campaigns: {
        transaction: async <T,>(_who: AdminActor, callback: (store: unknown) => Promise<T>) => callback({}),
        findCampaignByIdempotencyKey: calls.findCampaignByIdempotencyKey,
        getSavedSegment: async () => ({id: segmentId, ownerProfileId: creator.profileId, filters: {} as never}),
        audienceForSegment: async () => audience,
        createCampaign: calls.createCampaign,
        insertRecipients: calls.insertRecipients,
        appendAudit: calls.appendAudit,
      },
      templates: {list: async () => [templateRecord(status)]},
    } as never,
  };
}

const whatsappDraft = {
  draftId,
  segmentId,
  name: "September announcement",
  channel: "whatsapp" as const,
  template: null,
  templateKey: "wtia_announcement_en",
  variablesTemplate: {memberName: "{{displayName}}", headline: "Trade week", detailUrl: "https://hkwtia.org/news"},
};

describe("the campaign wizard's input contracts", () => {
  it("refuses a WhatsApp campaign with no template key before any write", async () => {
    const {calls, dependencies} = wizardDependencies();

    await expect(createCampaignDraft(creator, {...whatsappDraft, templateKey: null}, dependencies)).rejects.toThrow();
    expect(calls.createCampaign).not.toHaveBeenCalled();
  });

  it("refuses an email campaign with no source template before any write", async () => {
    const {calls, dependencies} = wizardDependencies();

    await expect(createCampaignDraft(creator, {
      ...whatsappDraft, channel: "email", templateKey: null, template: null, variablesTemplate: {},
    }, dependencies)).rejects.toThrow();
    expect(calls.createCampaign).not.toHaveBeenCalled();
  });

  // S-14 at the one place a human chooses a template. `approvedTemplateKeys`
  // gates the SEND, but in mock mode it returns the whole config set, so a
  // wizard that trusted it would offer a key production will silently skip —
  // the campaign would read `eligible` in the preview and send nothing.
  it("refuses a template key the registry has not approved, and writes nothing", async () => {
    const {calls, dependencies} = wizardDependencies([facts()], "pending");

    await expect(createCampaignDraft(creator, whatsappDraft, dependencies)).rejects.toThrow(/TEMPLATE_NOT_APPROVED/);
    expect(calls.createCampaign).not.toHaveBeenCalled();
  });

  it("snapshots the whole audience against the approved template's ordered variables", async () => {
    const {calls, dependencies} = wizardDependencies([facts(), facts({id: "member-2", whatsappOptedOutAt: new Date()})]);

    const result = await createCampaignDraft(creator, whatsappDraft, dependencies);

    expect(result.campaignId).toBe(campaignId);
    expect(calls.createCampaign.mock.calls[0][2]).toMatchObject({status: "draft", channel: "whatsapp", templateKey: "wtia_announcement_en"});
    const rows = calls.insertRecipients.mock.calls[0][3] as readonly Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    // The eligible row carries every parameter the template declares, resolved
    // once, here: `lib/channels/woztell.ts` sends `variables[key] ?? ""` and
    // Meta rejects an empty BODY parameter.
    expect(rows[0].variables).toEqual({memberName: "Ada Lovelace", headline: "Trade week", detailUrl: "https://hkwtia.org/news"});
    expect(rows[1]).toMatchObject({status: "suppressed", blockedReason: "suppressed"});
    // The count staff read is the sendable half, not the snapshot's size.
    expect(result.recipientCount).toBe(1);
    expect(calls.appendAudit.mock.calls[0][3]).toMatchObject({action: "campaign.drafted", eligible: 1, blocked: 1});
  });

  it("returns the draft the same draft id already created rather than a second one", async () => {
    const {calls, dependencies} = wizardDependencies();
    calls.findCampaignByIdempotencyKey.mockResolvedValue({campaignId, recipientCount: 7});

    const result = await createCampaignDraft(creator, whatsappDraft, dependencies);

    expect(result).toEqual({campaignId, recipientCount: 7, disposition: "existing"});
    expect(calls.createCampaign).not.toHaveBeenCalled();
  });

  /**
   * The idempotency key is the wizard RUN and the SEGMENT, because the unique
   * index behind it is on the key alone while the recovery read
   * (`findCampaignByIdempotencyKey`) filters on `segment_id`. With the draft
   * uuid as the whole key, a reader who created a draft, went Back to the wizard
   * URL that still carries it, chose a different segment and pressed Create
   * draft again made the INSERT conflict on a key the recovery read could not
   * see — and `createCampaign` threw "Campaign idempotency claim was not
   * visible" as a 500 on a button.
   *
   * Both halves are asserted together on purpose. A key that varied with the
   * segment but not deterministically would fix the 500 by breaking the
   * double-submit recovery the key exists for, which is the more expensive of
   * the two failures: it writes a second blast.
   */
  it("keys the draft on the wizard run AND the segment, deterministically", async () => {
    const otherSegmentId = "66666666-6666-4666-8666-666666666666";
    const key = campaignDraftKey(draftId, segmentId);

    expect(campaignDraftKey(draftId, segmentId)).toBe(key);
    expect(campaignDraftKey(draftId, otherSegmentId)).not.toBe(key);
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const {calls, dependencies} = wizardDependencies();
    await createCampaignDraft(creator, whatsappDraft, dependencies);

    // The same key for the recovery read and the write. The two disagreeing is
    // what turns a refresh into a second campaign.
    expect(calls.findCampaignByIdempotencyKey.mock.calls[0][2]).toBe(key);
    expect(calls.createCampaign.mock.calls[0][2]).toMatchObject({idempotencyKey: key});
  });
});

function reviewDependencies(campaign: Partial<CampaignRecord> = {}) {
  const calls = {
    recordReview: vi.fn(async (..._args: unknown[]) => undefined),
    schedule: vi.fn(async (..._args: unknown[]) => undefined),
    queueApproved: vi.fn(async (..._args: unknown[]) => undefined),
    submitForReview: vi.fn(async (..._args: unknown[]) => undefined),
  };
  const record: CampaignRecord = {
    id: campaignId,
    name: "September announcement",
    channel: "whatsapp",
    template: null,
    templateKey: "wtia_announcement_en",
    variablesTemplate: {},
    status: "review",
    segmentId,
    createdByProfileId: creator.profileId,
    scheduledAt: null,
    reviewedAt: null,
    reviewedByProfileId: null,
    rejectionReason: null,
    completedAt: null,
    createdAt: new Date("2026-09-10T00:00:00.000Z"),
    ...campaign,
  };
  return {
    calls,
    dependencies: {
      transaction: async <T,>(_who: AdminActor, callback: (store: unknown) => Promise<T>) => callback({}),
      campaignFor: async () => record,
      ...calls,
    } as never,
  };
}

const now = new Date("2026-09-11T00:00:00.000Z");

describe("the campaign review lifecycle", () => {
  it("rejects a schedule in the past", async () => {
    const {calls, dependencies} = reviewDependencies();

    await expect(approveCampaign(creator, campaignId, "2026-09-01T09:00", dependencies, now))
      .rejects.toThrow(/SCHEDULED_AT_IN_THE_PAST/);
    expect(calls.recordReview).not.toHaveBeenCalled();
    expect(calls.schedule).not.toHaveBeenCalled();
  });

  it("approves and schedules a WhatsApp campaign, in Hong Kong time", async () => {
    const {calls, dependencies} = reviewDependencies();

    await approveCampaign(creator, campaignId, "2026-09-12T09:00", dependencies, now);

    expect(calls.recordReview).toHaveBeenCalled();
    // 09:00 in Hong Kong is 01:00 UTC. A `datetime-local` value carries no zone,
    // so reading it as UTC would send eight hours early.
    expect(calls.schedule.mock.calls[0][3]).toEqual(new Date("2026-09-12T01:00:00.000Z"));
    expect(calls.queueApproved).not.toHaveBeenCalled();
  });

  // Task 10 Step 4c wires `promoteScheduledCampaigns` for both channels; until
  // it lands nothing promotes `scheduled → queued`, and an email campaign left
  // in `scheduled` would sit there forever with no error anywhere. Approving an
  // email campaign therefore queues it for the next hourly run instead.
  it("queues an approved email campaign and refuses to schedule one", async () => {
    const {calls, dependencies} = reviewDependencies({channel: "email", template: "renewal-reminder", templateKey: null});

    await approveCampaign(creator, campaignId, null, dependencies, now);
    expect(calls.queueApproved).toHaveBeenCalled();
    expect(calls.schedule).not.toHaveBeenCalled();

    await expect(approveCampaign(creator, campaignId, "2026-09-12T09:00", dependencies, now))
      .rejects.toThrow(/EMAIL_CAMPAIGN_CANNOT_BE_SCHEDULED/);
  });

  it("requires a send time for a WhatsApp approval", async () => {
    const {calls, dependencies} = reviewDependencies();

    await expect(approveCampaign(creator, campaignId, null, dependencies, now)).rejects.toThrow(/SCHEDULED_AT_REQUIRED/);
    expect(calls.recordReview).not.toHaveBeenCalled();
  });

  it("refuses a member actor before the transaction opens", async () => {
    const {calls, dependencies} = reviewDependencies();
    const member = {kind: "member", userId: "member-1", profileId: "member-1"} as const;

    await expect(submitCampaignForReview(member, campaignId, dependencies)).rejects.toThrow();
    await expect(rejectCampaign(member, campaignId, "no", dependencies)).rejects.toThrow();
    await expect(approveCampaign(member, campaignId, null, dependencies, now)).rejects.toThrow();
    expect(calls.submitForReview).not.toHaveBeenCalled();
    expect(calls.recordReview).not.toHaveBeenCalled();
  });

  it("carries a rejection reason through to the repository", async () => {
    const {calls, dependencies} = reviewDependencies();

    await rejectCampaign(creator, campaignId, "  Wrong segment  ", dependencies);

    expect(calls.recordReview.mock.calls[0][3]).toEqual({outcome: "rejected", reason: "Wrong segment"});
  });
});

describe("the wizard's URL state", () => {
  it("keeps every answer in the query string and defaults an unknown value away", () => {
    const state = parseCampaignWizardQuery({
      step: "preview",
      name: " September announcement ",
      channel: "whatsapp",
      templateKey: "wtia_announcement_en",
      template: "not-a-template",
      segmentId,
      var_headline: "Trade week",
      var_bogus: "",
    }, draftId);

    expect(state).toMatchObject({
      draftId,
      step: "preview",
      name: "September announcement",
      channel: "whatsapp",
      templateKey: "wtia_announcement_en",
      template: null,
      segmentId,
    });
    expect(state.variables).toEqual({headline: "Trade week"});
  });

  it("falls back to the first step for an unknown step and an unknown channel", () => {
    const state = parseCampaignWizardQuery({step: "danger", channel: "sms"}, draftId);
    expect(state.step).toBe(CAMPAIGN_WIZARD_STEPS[0]);
    expect(state.channel).toBe("email");
  });

  /**
   * The forward path, which is where this went wrong: the step set is computed
   * one request BEFORE the template that decides it, so keying it on the
   * resolved variables alone pointed the template step's Next at `segment` and
   * every parameterised WhatsApp template skipped its own details step.
   */
  it("keeps the variables step reachable while the WhatsApp template is still unchosen", () => {
    const pending = visibleWizardSteps({channel: "whatsapp", templateKey: null}, []);

    expect(pending).toContain("variables");
    expect(nextWizardStep("template", pending)).toBe("variables");
  });

  it("skips the variables step for email and for a template that declares none", () => {
    const email = visibleWizardSteps({channel: "email", templateKey: null}, []);
    expect(email).not.toContain("variables");
    expect(nextWizardStep("template", email)).toBe("segment");
    expect(previousWizardStep("segment", email)).toBe("template");

    const chosen = visibleWizardSteps({channel: "whatsapp", templateKey: "wtia_announcement_en"}, []);
    expect(chosen).not.toContain("variables");
    // The step was offered a request ago, so a URL can still ask for it. It
    // resolves FORWARD — landing back on "name" with every answer intact and no
    // explanation is the worse of the two wrong answers.
    expect(resolveWizardStep("variables", chosen)).toBe("segment");
    expect(resolveWizardStep("segment", chosen)).toBe("segment");

    expect(visibleWizardSteps({channel: "whatsapp", templateKey: "wtia_announcement_en"}, ["headline"])).toContain("variables");
  });

  it("names the first step still missing an answer, so the preview cannot be reached empty", () => {
    const base = {draftId, step: "preview" as const, name: "", channel: "whatsapp" as const, template: null, templateKey: null, variables: {}, segmentId: null};
    expect(wizardBlockingStep(base, [])).toBe("name");
    expect(wizardBlockingStep({...base, name: "x"}, [])).toBe("template");
    expect(wizardBlockingStep({...base, name: "x", templateKey: "wtia_announcement_en"}, ["headline"])).toBe("variables");
    expect(wizardBlockingStep({...base, name: "x", templateKey: "k", variables: {headline: "y"}}, ["headline"])).toBe("segment");
    expect(wizardBlockingStep({...base, name: "x", templateKey: "k", variables: {headline: "y"}, segmentId}, ["headline"])).toBeNull();
  });
});
