import {describe, expect, it, vi} from "vitest";
import {createPartner, listPublishedPartners, setPartnerArchived, setPartnerPublished, updatePartner, type PartnerMutationDependencies} from "@/lib/db/repos/partners";
import {createLandingPartner, listPublishedLandingPartners, setLandingPartnerArchived, setLandingPartnerPublished, updateLandingPartner, type LandingPartnerMutationDependencies} from "@/lib/db/repos/landing-partners";

const staff = {kind: "staff", userId: "staff-user", profileId: "staff-profile"} as const;
const member = {kind: "member", userId: "member-user", profileId: "member-profile"} as const;
const partnerId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-08-28T16:30:00.000Z");
const partnerInput = {nameEn: "Hong Kong Partner", nameZhHk: "香港夥伴", category: "regional", websiteUrl: "https://example.com/", logoMediaId: mediaId, displayOrder: 20, featured: true, relationshipStartsOn: "2026-08-29", relationshipEndsOn: "2026-08-29"} as const;
function partner(overrides: Record<string, unknown> = {}) { return {id: partnerId, ...partnerInput, relationshipConfirmedAt: now, logoRightsConfirmedAt: now, publishedAt: now, archivedAt: null, logoMediaUrl: "/logo", logoMediaAltEn: "Logo", logoMediaAltZh: "標誌", logoMediaArchivedAt: null, createdAt: now, updatedAt: now, ...overrides}; }
function partnerDeps(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const tx = {insertPartner: vi.fn(async (input: Record<string, unknown>) => partner(input)), getPartner: vi.fn(async () => partner()), lockMedia: vi.fn(async () => { calls.push("media"); return {id: mediaId, url: "/logo", archivedAt: null, altEn: "Logo", altZh: "標誌"}; }), lockPartner: vi.fn(async () => { calls.push("partner"); return partner(); }), updatePartner: vi.fn(async (_id: string, input: Record<string, unknown>) => partner(input)), setPublishedAt: vi.fn(async (_id: string, value: Date | null) => partner({publishedAt: value})), setArchivedAt: vi.fn(async (_id: string, value: Date | null) => partner({archivedAt: value})), insertAudit: vi.fn(async () => undefined), ...overrides};
  const dependencies: PartnerMutationDependencies = {transaction: (work) => work(tx as never)};
  return {dependencies, tx, calls};
}

describe("general partner repository", () => {
  it("authorizes before validation or transaction work", async () => {
    const {dependencies, tx} = partnerDeps(); const transaction = vi.spyOn(dependencies, "transaction");
    await expect(createPartner(member, null, dependencies)).rejects.toThrow("FORBIDDEN");
    await expect(setPartnerPublished(member, "bad", true, dependencies)).rejects.toThrow("FORBIDDEN");
    expect(transaction).not.toHaveBeenCalled(); expect(tx.lockMedia).not.toHaveBeenCalled();
  });
  it("locks active bilingual media before creating and audits in one transaction", async () => {
    const {dependencies, tx} = partnerDeps(); await createPartner(staff, partnerInput, dependencies);
    expect(tx.lockMedia).toHaveBeenCalledWith(mediaId); expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "partner.created"}));
  });
  it("requires both confirmations and active bilingual-alt media before publishing", async () => {
    for (const current of [partner({relationshipConfirmedAt: null, publishedAt: null}), partner({logoRightsConfirmedAt: null, publishedAt: null})]) {
      const {dependencies, tx} = partnerDeps({getPartner: vi.fn(async () => current), lockPartner: vi.fn(async () => current)});
      await expect(setPartnerPublished(staff, partnerId, true, dependencies, () => now)).rejects.toThrow("PARTNER_PUBLICATION_NOT_READY");
      expect(tx.setPublishedAt).not.toHaveBeenCalled();
    }
    const inactive = partnerDeps({getPartner: vi.fn(async () => partner({publishedAt: null})), lockPartner: vi.fn(async () => partner({publishedAt: null})), lockMedia: vi.fn(async () => ({id: mediaId, url: "/logo", archivedAt: now, altEn: "Logo", altZh: "標誌"}))});
    await expect(setPartnerPublished(staff, partnerId, true, inactive.dependencies, () => now)).rejects.toThrow("PARTNER_PUBLICATION_NOT_READY");
  });
  it("locks referenced media before the partner row", async () => {
    const {dependencies, calls} = partnerDeps({getPartner: vi.fn(async () => partner({publishedAt: null})), lockPartner: vi.fn(async () => { calls.push("partner"); return partner({publishedAt: null}); })});
    await setPartnerPublished(staff, partnerId, true, dependencies, () => now); expect(calls).toEqual(["media", "partner"]);
  });
  it("fails safely when the logo changes between observation and partner locking", async () => {
    const changedLogo = "33333333-3333-4333-8333-333333333333";
    const stale = partnerDeps({getPartner: vi.fn(async () => partner({publishedAt: null, logoMediaId: mediaId})), lockPartner: vi.fn(async () => partner({publishedAt: null, logoMediaId: changedLogo}))});
    await expect(setPartnerPublished(staff, partnerId, true, stale.dependencies, () => now)).rejects.toThrow("PARTNER_LOGO_CHANGED_RETRY");
    expect(stale.tx.setPublishedAt).not.toHaveBeenCalled();
    const update = partnerDeps({getPartner: vi.fn(async () => partner({logoMediaId: mediaId})), lockPartner: vi.fn(async () => partner({logoMediaId: changedLogo}))});
    await expect(updatePartner(staff, partnerId, {nameEn: "Safe update"}, update.dependencies, () => now)).rejects.toThrow("PARTNER_LOGO_CHANGED_RETRY");
    expect(update.tx.updatePartner).not.toHaveBeenCalled();
  });
  it("requires explicit unpublish before archive and rejects publishing archived rows", async () => {
    const archived = partner({publishedAt: null, archivedAt: now});
    const publishDeps = partnerDeps({getPartner: vi.fn(async () => archived), lockPartner: vi.fn(async () => archived)});
    await expect(setPartnerPublished(staff, partnerId, true, publishDeps.dependencies, () => now)).rejects.toThrow("PARTNER_LIFECYCLE_INVALID");
    const published = partner({publishedAt: now, archivedAt: null});
    const archiveDeps = partnerDeps({getPartner: vi.fn(async () => published), lockPartner: vi.fn(async () => published)});
    await expect(setPartnerArchived(staff, partnerId, true, archiveDeps.dependencies, () => now)).rejects.toThrow("PARTNER_LIFECYCLE_INVALID");
    expect(archiveDeps.tx.setArchivedAt).not.toHaveBeenCalled();
  });
  it("uses inclusive Hong Kong dates, bounded limits, safe fields, and deterministic order", async () => {
    const rows = [partner({id: "00000000-0000-4000-8000-000000000002", displayOrder: 1, nameEn: "Zulu", featured: false}), partner({id: "00000000-0000-4000-8000-000000000001", displayOrder: 1, nameEn: "Alpha", featured: true}), partner({id: "00000000-0000-4000-8000-000000000003", relationshipEndsOn: "2026-08-28"})];
    const result = await listPublishedPartners("en", {limit: 2, asOf: now}, rows as never);
    expect(result.map((row) => row.id)).toEqual(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]);
    expect(Object.keys(result[0]!).sort()).toEqual(["category", "displayOrder", "featured", "id", "logoAlt", "logoUrl", "name", "websiteUrl"]);
    await expect(listPublishedPartners("en", {limit: 101, asOf: now}, rows as never)).rejects.toThrow();
  });
  it("applies identical bilingual-alt, clock, locale-order, and bound rules to injected and database sources", async () => {
    const eligibleZhZulu = partner({id: "00000000-0000-4000-8000-000000000011", featured: false, displayOrder: 1, nameEn: "Alpha", nameZhHk: "Zulu", publishedAt: new Date("2026-08-28T16:29:59.000Z")});
    const eligibleZhAlpha = partner({id: "00000000-0000-4000-8000-000000000012", featured: false, displayOrder: 1, nameEn: "Zulu", nameZhHk: "Alpha", publishedAt: now});
    const invalidRows = [partner({id: "future", logoMediaAltEn: "Logo", logoMediaAltZh: "標誌", publishedAt: new Date("2026-08-28T16:30:00.001Z")}), partner({id: "blank-en", logoMediaAltEn: " ", logoMediaAltZh: "標誌"}), partner({id: "blank-zh", logoMediaAltEn: "Logo", logoMediaAltZh: "\u3000"})];
    const injected = await listPublishedPartners("zh-HK", {limit: 2, asOf: now}, [eligibleZhZulu, eligibleZhAlpha, ...invalidRows] as never);
    expect(injected.map((row) => row.id)).toEqual([eligibleZhAlpha.id, eligibleZhZulu.id]);
    const list = vi.fn(async () => [eligibleZhAlpha, eligibleZhZulu]);
    const database = await listPublishedPartners("zh-HK", {limit: 2, asOf: now}, {list});
    expect(list).toHaveBeenCalledWith("2026-08-29", now, "zh-HK", 2);
    expect(database).toEqual(injected);
  });
});

function landing(overrides: Record<string, unknown> = {}) { return {id: partnerId, organizationEn: "Bridge Co", organizationZhHk: "橋樑公司", market: "Singapore", region: "Asia", mouStatus: "signed", contact: {email: "private@example.com"}, notes: "private negotiation", publishedAt: now, archivedAt: null, createdAt: now, updatedAt: now, ...overrides}; }
describe("Launch Pad partner repository", () => {
  it("authorizes before parsing and audits creation in its transaction", async () => {
    const tx = {insertPartner: vi.fn(async (input: Record<string, unknown>) => landing(input)), lockPartner: vi.fn(async () => landing()), updatePartner: vi.fn(), setPublishedAt: vi.fn(), setArchivedAt: vi.fn(), insertAudit: vi.fn(async () => undefined)};
    const dependencies: LandingPartnerMutationDependencies = {transaction: (work) => work(tx as never)};
    await expect(createLandingPartner(member, null, dependencies)).rejects.toThrow("FORBIDDEN"); expect(tx.insertPartner).not.toHaveBeenCalled();
    await createLandingPartner(staff, {organizationEn: "Bridge Co", organizationZhHk: "橋樑公司", market: "Singapore", region: "Asia", mouStatus: "signed", contact: {}, notes: null}, dependencies);
    expect(tx.insertAudit).toHaveBeenCalledWith(expect.objectContaining({action: "landing_partner.created"}));
  });
  it("exposes only signed active published unarchived display fields", async () => {
    const rows = [landing(), landing({id: "draft", publishedAt: null}), landing({id: "unsigned", mouStatus: "in_discussion"}), landing({id: "inactive", mouStatus: "inactive"}), landing({id: "archived", archivedAt: now})];
    const result = await listPublishedLandingPartners({limit: 100}, rows as never);
    expect(result).toEqual([{id: partnerId, organizationEn: "Bridge Co", organizationZhHk: "橋樑公司", market: "Singapore", region: "Asia"}]);
    expect(JSON.stringify(result)).not.toMatch(/private|contact|notes|mouStatus/i);
  });
  it("preserves signed state while published and requires unpublish before archive", async () => {
    const tx = {insertPartner: vi.fn(), lockPartner: vi.fn(async () => landing()), updatePartner: vi.fn(async (_id: string, input: Record<string, unknown>) => landing(input)), setPublishedAt: vi.fn(), setArchivedAt: vi.fn(), insertAudit: vi.fn()};
    const dependencies: LandingPartnerMutationDependencies = {transaction: (work) => work(tx as never)};
    await expect(updateLandingPartner(staff, partnerId, {mouStatus: "inactive"}, dependencies)).rejects.toThrow("LANDING_PARTNER_LIFECYCLE_INVALID");
    await expect(setLandingPartnerArchived(staff, partnerId, true, dependencies, () => now)).rejects.toThrow("LANDING_PARTNER_LIFECYCLE_INVALID");
    tx.lockPartner.mockResolvedValue(landing({publishedAt: null, archivedAt: now}));
    await expect(setLandingPartnerPublished(staff, partnerId, true, dependencies, () => now)).rejects.toThrow("LANDING_PARTNER_LIFECYCLE_INVALID");
  });
});
