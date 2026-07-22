import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  preview: vi.fn(),
  auditExport: vi.fn(),
}));

vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => ({kind: "staff", userId: "staff-auth", profileId: "staff-profile"}),
}));
vi.mock("@/lib/db/repos/segments", () => ({segmentsRepository: mocks}));

import {GET} from "@/app/api/admin/segments/[id]/export/route";

const segmentId = "11111111-1111-4111-8111-111111111111";
const filters = {profileIds: [], tier: [], status: [], scoreMin: null, scoreMax: null, renewalWithinDays: null, sector: "", lastLoginBeforeDays: null};
const member = {profileId: "member-1", displayName: "Member One", email: null, companyName: null, planCode: null, membershipStatus: null, renewalAt: null, score: null};

describe("segment export completion audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({id: segmentId, filterVersion: 1, filters});
  });

  it("does not record a successful export when a later page fails", async () => {
    mocks.preview
      .mockResolvedValueOnce({total: 2, items: [member], nextCursor: "next-page"})
      .mockRejectedValueOnce(new Error("later page failed"));

    const response = await GET(new Request("http://localhost/api/admin/segments/export"), {params: Promise.resolve({id: segmentId})});
    await expect(response.text()).rejects.toThrow("later page failed");
    expect(mocks.auditExport).not.toHaveBeenCalled();
  });

  it("records one exact row count only after all pages complete", async () => {
    mocks.preview
      .mockResolvedValueOnce({total: 2, items: [member], nextCursor: "next-page"})
      .mockResolvedValueOnce({total: 2, items: [{...member, profileId: "member-2", displayName: "Member Two"}], nextCursor: null});

    const response = await GET(new Request("http://localhost/api/admin/segments/export"), {params: Promise.resolve({id: segmentId})});
    await expect(response.text()).resolves.toContain("member-2");
    expect(mocks.auditExport).toHaveBeenCalledTimes(1);
    expect(mocks.auditExport).toHaveBeenCalledWith(expect.objectContaining({profileId: "staff-profile"}), segmentId, 1, 2);
  });
});