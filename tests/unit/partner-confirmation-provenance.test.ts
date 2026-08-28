import {describe, expect, it, vi} from "vitest";

import {runPartnerFormAction} from "@/lib/admin/partner-action-core";
import {
  updatePartner,
  type PartnerMutationDependencies,
} from "@/lib/db/repos/partners";

const staff = {kind: "staff", userId: "staff-user", profileId: "staff-profile"} as const;
const partnerId = "11111111-1111-4111-8111-111111111111";
const mediaId = "22222222-2222-4222-8222-222222222222";
const relationshipConfirmedAt = new Date("2026-04-01T01:02:03.000Z");
const logoRightsConfirmedAt = new Date("2026-05-02T03:04:05.000Z");
const injectedNow = new Date("2026-08-29T04:05:06.000Z");

function partner(overrides: Record<string, unknown> = {}) {
  return {
    id: partnerId,
    nameEn: "Partner",
    nameZhHk: "夥伴",
    category: "regional",
    websiteUrl: "https://example.com/",
    logoMediaId: mediaId,
    displayOrder: 5,
    featured: true,
    relationshipStartsOn: "2026-08-29",
    relationshipEndsOn: "2026-08-29",
    relationshipConfirmedAt,
    logoRightsConfirmedAt,
    publishedAt: null,
    archivedAt: null,
    createdAt: relationshipConfirmedAt,
    updatedAt: relationshipConfirmedAt,
    ...overrides,
  };
}

function dependencies(current = partner()) {
  const tx = {
    insertPartner: vi.fn(),
    getPartner: vi.fn(async () => current),
    lockMedia: vi.fn(async () => ({
      id: mediaId,
      url: "/logo",
      altEn: "Logo",
      altZh: "標誌",
      archivedAt: null,
    })),
    lockPartner: vi.fn(async () => current),
    updatePartner: vi.fn(async (_id: string, patch: Record<string, unknown>) =>
      partner({...current, ...patch})),
    setPublishedAt: vi.fn(),
    setArchivedAt: vi.fn(),
    insertAudit: vi.fn(async (_input: unknown) => undefined),
  };
  const value: PartnerMutationDependencies = {
    transaction: (work) => work(tx as never),
  };
  return {value, tx};
}

function editForm(): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    nameEn: "Renamed partner",
    nameZhHk: "夥伴",
    category: "regional",
    websiteUrl: "https://example.com/",
    logoMediaId: mediaId,
    displayOrder: "5",
    relationshipStartsOn: "2026-08-29",
    relationshipEndsOn: "2026-08-29",
  })) data.set(key, value);
  data.set("featured", "on");
  data.set("relationshipConfirmed", "on");
  data.set("logoRightsConfirmed", "on");
  return data;
}

function auditFields(tx: ReturnType<typeof dependencies>["tx"]): string[] {
  const event = tx.insertAudit.mock.calls[0]?.[0] as {metadata: {fields: string[]}};
  return event.metadata.fields;
}

describe("general partner confirmation provenance", () => {
  it("preserves confirmed timestamps through an unrelated form action and omits them from audit fields", async () => {
    const {value, tx} = dependencies();
    const result = await runPartnerFormAction({}, editForm(), {
      successMessage: "Saved",
      validationMessage: "Check fields",
      errorMessage: "Try again",
      mutate: (input) => updatePartner(staff, partnerId, input, value, () => injectedNow),
    });

    expect(result.status).toBe("success");
    const patch = tx.updatePartner.mock.calls[0]?.[1];
    expect(patch).not.toHaveProperty("relationshipConfirmedAt");
    expect(patch).not.toHaveProperty("logoRightsConfirmedAt");
    expect(auditFields(tx)).not.toContain("relationshipConfirmedAt");
    expect(auditFields(tx)).not.toContain("logoRightsConfirmedAt");
  });

  it("uses the injected clock only for an initial confirmation transition", async () => {
    const {value, tx} = dependencies(partner({relationshipConfirmedAt: null}));
    await updatePartner(staff, partnerId, {
      relationshipConfirmed: true,
      logoRightsConfirmed: true,
    }, value, () => injectedNow);

    expect(tx.updatePartner).toHaveBeenCalledWith(partnerId, {
      relationshipConfirmedAt: injectedNow,
    });
    expect(auditFields(tx)).toEqual(["relationshipConfirmedAt"]);
  });

  it("clears a revoked confirmation without rewriting the other confirmed timestamp", async () => {
    const {value, tx} = dependencies();
    await updatePartner(staff, partnerId, {
      relationshipConfirmed: false,
      logoRightsConfirmed: true,
    }, value, () => injectedNow);

    expect(tx.updatePartner).toHaveBeenCalledWith(partnerId, {
      relationshipConfirmedAt: null,
    });
    expect(auditFields(tx)).toEqual(["relationshipConfirmedAt"]);
  });
});
