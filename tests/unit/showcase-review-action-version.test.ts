import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  actor: {kind: "staff", userId: "staff-1", profileId: "staff-1"},
  publish: vi.fn(async () => null),
  reject: vi.fn(async () => null),
}));

vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => state.actor}));
vi.mock("@/lib/db/repos/showcase", () => ({showcaseRepository: {publish: state.publish, reject: state.reject}}));
vi.mock("@/lib/admin/revalidate-path", () => ({revalidateAdminPath: vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));

import {publishShowcaseListingAction, rejectShowcaseListingAction} from "@/lib/admin/showcase-actions";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => { state.publish.mockClear(); state.reject.mockClear(); });

describe("showcase review server actions", () => {
  it("passes the staff-reviewed row version through both action and core boundaries", async () => {
    await publishShowcaseListingAction("/en/admin/listings-review", form({listingId: "listing-1", reviewVersion: "42"}));
    await rejectShowcaseListingAction("/en/admin/listings-review", form({listingId: "listing-2", reviewVersion: "84", rejectionReason: "Needs changes"}));
    expect(state.publish).toHaveBeenCalledWith(state.actor, "listing-1", "42");
    expect(state.reject).toHaveBeenCalledWith(state.actor, "listing-2", "Needs changes", "84");
  });
});
