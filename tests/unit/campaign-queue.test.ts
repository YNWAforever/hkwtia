import {describe, expect, it} from "vitest";

import {isEligibleCampaignEmail, queueCampaign, resolveCampaignDraft, type CampaignQueueMember} from "@/lib/admin/campaigns";
import {campaignsRepository, createCampaignsRepository} from "@/lib/db/repos/campaigns";
import {auditEvents, campaignRecipients, campaigns, savedSegments} from "@/lib/db/server-schema";
import type {AdminActor} from "@/lib/membership/lifecycle";

const actor = (): AdminActor => ({kind: "staff", userId: "staff-1", profileId: "staff-1"});
const input = {
  segmentId: "11111111-1111-4111-8111-111111111111",
  template: "renewal-reminder",
  localeStrategy: "profile" as const,
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
};

const segmentFilters = {profileIds: [], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null};

class Barrier {
  private arrivals = 0;
  private release!: () => void;
  private readonly released = new Promise<void>((resolve) => { this.release = resolve; });

  constructor(private readonly parties: number) {}

  async arriveAndWait(): Promise<void> {
    this.arrivals += 1;
    if (this.arrivals === this.parties) this.release();
    await this.released;
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return {promise, resolve};
}

type StoredCampaign = Readonly<{id: string; segmentId: string; createdByProfileId: string; template: string; localeStrategy: string; idempotencyKey: string}>;
type StoredRecipient = Readonly<{campaignId: string; profileId: string; email: string; locale: string; variables: Readonly<Record<string, string | null>>}>;
type StoredAudit = Readonly<{actorUserId: string; actorType: string; action: string; targetType: string; targetId: string; metadata: Readonly<{recipientCount: number}>}>;
type TransactionState = {
  id: number;
  initialCampaignLookup: boolean;
  campaigns: StoredCampaign[];
  recipients: StoredRecipient[];
  audits: StoredAudit[];
  completion: ReturnType<typeof deferred<"committed" | "rolled-back">>;
};

class FakeSelectQuery implements PromiseLike<unknown[]> {
  constructor(private readonly rows: () => Promise<unknown[]>) {}

  where(): this { return this; }
  async limit(count: number): Promise<unknown[]> { return (await this.rows()).slice(0, count); }
  then<TResult1 = unknown[], TResult2 = never>(
    onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.rows().then(onfulfilled, onrejected);
  }
}

type CampaignFailurePoint = "create" | "recipients" | "audit";

function createConcurrentCampaignDatabase({parties = 2, failAt}: Readonly<{parties?: number; failAt?: CampaignFailurePoint}> = {}) {
  const lookupBarrier = new Barrier(parties);
  const store = {
    campaigns: [] as StoredCampaign[],
    recipients: [] as StoredRecipient[],
    audits: [] as StoredAudit[],
    initialLookupMisses: 0,
    uniqueConstraintConflicts: 0,
    commits: [] as Array<Readonly<{disposition: "created" | "existing"; campaigns: number; recipients: number; audits: number}>>,
    rollbacks: [] as Array<Readonly<{campaigns: number; recipients: number; audits: number}>>,
  };
  const claims = new Map<string, TransactionState>();
  let nextTransactionId = 0;

  const database = {
    async transaction<T>(callback: (transaction: unknown) => Promise<T>): Promise<T> {
      const transactionState: TransactionState = {
        id: ++nextTransactionId,
        initialCampaignLookup: false,
        campaigns: [],
        recipients: [],
        audits: [],
        completion: deferred(),
      };
      const visibleCampaigns = () => [...store.campaigns, ...transactionState.campaigns];
      const transaction = {
        select: () => ({
          from: (table: unknown) => new FakeSelectQuery(async () => {
            if (table === savedSegments) return [{id: input.segmentId, ownerProfileId: actor().profileId, filters: segmentFilters}];
            if (table === campaigns) {
              const isInitialLookup = !transactionState.initialCampaignLookup;
              if (isInitialLookup) {
                transactionState.initialCampaignLookup = true;
                await lookupBarrier.arriveAndWait();
              }
              const visible = visibleCampaigns();
              if (isInitialLookup && visible.length === 0) store.initialLookupMisses += 1;
              return visible;
            }
            if (table === campaignRecipients) return [{count: store.recipients.length + transactionState.recipients.length}];
            throw new Error("Unexpected campaign SELECT table");
          }),
        }),
        execute: async () => ({rows: [{
          profileId: "member-1",
          displayName: "Fixture Member",
          email: "member1@example.test",
          locale: "zh-HK",
          consentMarketing: true,
          suppressed: false,
          renewalAt: new Date("2026-08-20T00:00:00.000Z"),
        }]}),
        insert: (table: unknown) => ({
          values: (value: unknown) => {
            if (table === campaigns) {
              const row = value as Omit<StoredCampaign, "id">;
              return {
                onConflictDoNothing: () => ({
                  returning: async () => {
                    if (failAt === "create") throw new Error("campaign insert failed");
                    const owner = claims.get(row.idempotencyKey);
                    if (!owner) {
                      const campaign = {...row, id: "44444444-4444-4444-8444-444444444444"};
                      transactionState.campaigns.push(campaign);
                      claims.set(row.idempotencyKey, transactionState);
                      return [{id: campaign.id}];
                    }
                    if (owner.id === transactionState.id) return [{id: owner.campaigns[0]?.id}];
                    store.uniqueConstraintConflicts += 1;
                    const outcome = await owner.completion.promise;
                    if (outcome === "rolled-back") {
                      const campaign = {...row, id: "44444444-4444-4444-8444-444444444444"};
                      transactionState.campaigns.push(campaign);
                      claims.set(row.idempotencyKey, transactionState);
                      return [{id: campaign.id}];
                    }
                    return [];
                  },
                }),
              };
            }
            if (table === campaignRecipients) {
              if (failAt === "recipients") throw new Error("recipient insert failed");
              transactionState.recipients.push(...value as StoredRecipient[]);
              return Promise.resolve();
            }
            if (table === auditEvents) {
              if (failAt === "audit") throw new Error("audit insert failed");
              transactionState.audits.push(value as StoredAudit);
              return Promise.resolve();
            }
            throw new Error("Unexpected campaign INSERT table");
          },
        }),
      };

      try {
        const result = await callback(transaction);
        store.campaigns.push(...transactionState.campaigns);
        store.recipients.push(...transactionState.recipients);
        store.audits.push(...transactionState.audits);
        const disposition = (result as {disposition: "created" | "existing"}).disposition;
        store.commits.push({disposition, campaigns: transactionState.campaigns.length, recipients: transactionState.recipients.length, audits: transactionState.audits.length});
        transactionState.completion.resolve("committed");
        return result;
      } catch (error) {
        store.rollbacks.push({campaigns: transactionState.campaigns.length, recipients: transactionState.recipients.length, audits: transactionState.audits.length});
        transactionState.completion.resolve("rolled-back");
        throw error;
      }
    },
  };

  return {database, store};
}

function fakeDependencies() {
  const recipients: unknown[] = [];
  const campaigns: Array<{campaignId: string; idempotencyKey: string}> = [];

  return {
    recipients,
    dependencies: {
      transaction: async <T>(_actor: unknown, callback: (store: unknown) => Promise<T>) => callback({}),
      getSavedSegment: async () => ({id: input.segmentId, ownerProfileId: "staff-1", filters: {profileIds: [], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null}}),
      membersForSegment: async (): Promise<readonly CampaignQueueMember[]> => [{profileId: "member-1", displayName: "Fixture Member", email: "member1@example.test", locale: "zh-HK", consentMarketing: true, suppressed: false, renewalAt: "2026-08-20"}],
      findCampaignByIdempotencyKey: async (_actor: unknown, _store: unknown, key: string) => {
        const campaign = campaigns.find((item) => item.idempotencyKey === key);
        return campaign ? {campaignId: campaign.campaignId, recipientCount: recipients.length} : null;
      },
      createCampaign: async (_actor: unknown, _store: unknown, campaign: {idempotencyKey: string}) => {
        const created = {campaignId: "campaign-1", idempotencyKey: campaign.idempotencyKey};
        campaigns.push(created);
        return {campaignId: created.campaignId, recipientCount: 0, disposition: "created" as const};
      },
      insertRecipients: async (_actor: unknown, _store: unknown, _campaignId: string, rows: readonly unknown[]) => { recipients.push(...rows); },
      appendAudit: async () => undefined,
    },
  };
}

describe("campaign queue", () => {
  it("queues one immutable snapshot when concurrent production repository calls race", async () => {
    const race = createConcurrentCampaignDatabase();
    const repository = createCampaignsRepository(async () => race.database as never);

    const results = await Promise.all([
      queueCampaign(actor(), input, repository),
      queueCampaign(actor(), input, repository),
    ]);

    expect(results.map(({disposition}) => disposition).sort()).toEqual(["created", "existing"]);
    expect(results.every(({campaignId, recipientCount}) => campaignId === "44444444-4444-4444-8444-444444444444" && recipientCount === 1)).toBe(true);
    expect(race.store.initialLookupMisses).toBe(2);
    expect(race.store.uniqueConstraintConflicts).toBe(1);
    expect(race.store.campaigns).toHaveLength(1);
    expect(race.store.recipients).toEqual([{
      campaignId: "44444444-4444-4444-8444-444444444444",
      profileId: "member-1",
      email: "member1@example.test",
      locale: "zh-HK",
      variables: {displayName: "Fixture Member", renewalDate: "2026-08-20"},
    }]);
    expect(race.store.audits).toEqual([{
      actorUserId: "staff-1",
      actorType: "staff",
      action: "campaign.queued",
      targetType: "campaign",
      targetId: "44444444-4444-4444-8444-444444444444",
      metadata: {recipientCount: 1},
    }]);
    expect(race.store.commits.find(({disposition}) => disposition === "existing")).toEqual({
      disposition: "existing",
      campaigns: 0,
      recipients: 0,
      audits: 0,
    });
  });
  it.each(["create", "recipients", "audit"] as const)("rolls back all production queue writes when %s insertion fails", async (failAt) => {
    const fake = createConcurrentCampaignDatabase({parties: 1, failAt});
    const repository = createCampaignsRepository(async () => fake.database as never);
    const message = failAt === "create" ? "campaign insert failed" : failAt === "recipients" ? "recipient insert failed" : "audit insert failed";

    await expect(queueCampaign(actor(), input, repository)).rejects.toThrow(message);
    expect(fake.store.campaigns).toEqual([]);
    expect(fake.store.recipients).toEqual([]);
    expect(fake.store.audits).toEqual([]);
    expect(fake.store.commits).toEqual([]);
    expect(fake.store.rollbacks).toHaveLength(1);
  });
  it("rejects anonymous actors at every direct repository entry before database access", async () => {
    const anonymous = {kind: "anonymous" as const, userId: null};
    await expect(campaignsRepository.transaction(anonymous, async () => undefined)).rejects.toThrow();
    await expect(campaignsRepository.findCampaignByIdempotencyKey(anonymous, {}, "22222222-2222-4222-8222-222222222222", input.segmentId)).rejects.toThrow();
    await expect(campaignsRepository.getSavedSegment(anonymous, {}, input.segmentId)).rejects.toThrow();
    await expect(campaignsRepository.membersForSegment(anonymous, {}, {profileIds: [], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null})).rejects.toThrow();
    await expect(campaignsRepository.createCampaign(anonymous, {}, input)).rejects.toThrow();
    await expect(campaignsRepository.insertRecipients(anonymous, {}, "campaign-1", [])).rejects.toThrow();
    await expect(campaignsRepository.appendAudit(anonymous, {}, "campaign-1", 0)).rejects.toThrow();
  });
  it("keeps the URL-bound draft stable until an explicit new draft is requested", () => {
    expect(resolveCampaignDraft("11111111-1111-4111-8111-111111111111", () => "new-draft")).toEqual({draftId: "11111111-1111-4111-8111-111111111111", created: false});
    expect(resolveCampaignDraft(null, () => "new-draft")).toEqual({draftId: "new-draft", created: true});
  });

  it.each([[" member@example.test ", "member@example.test"], ["not-an-email", null], ["   ", null], [null, null]])("normalizes only a valid campaign email", (value, expected) => {
    expect(isEligibleCampaignEmail(value)).toBe(expected);
  });
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

    await expect(queueCampaign(actor(), {...input, idempotencyKey: "33333333-3333-4333-8333-333333333333"}, fake.dependencies)).resolves.toEqual({campaignId: "campaign-1", recipientCount: 1, disposition: "created"});
    expect(fake.recipients).toEqual([{
      profileId: "eligible",
      email: "eligible@example.test",
      locale: "en",
      variables: {displayName: "Eligible"},
    }]);
  });
});
