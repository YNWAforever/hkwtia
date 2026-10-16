import {describe, expect, it, vi} from "vitest";

const auth = vi.hoisted(() => ({actor: vi.fn()}));
const store = vi.hoisted(() => ({save: vi.fn(), list: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: auth.actor}));
vi.mock("@/lib/db/repos/admin-member-views", () => ({adminMemberViewsRepository: store}));
vi.mock("@/lib/admin/revalidate-path", () => ({revalidateAdminPath: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => {throw new Error("NEXT_NOT_FOUND");}}));

import {saveMemberViewAction} from "@/lib/admin/member-view-actions";

const idle = {status: "idle"} as const;
function form(query: unknown) {const data = new FormData(); data.set("name", "Active"); data.set("query", JSON.stringify(query)); return data;}

describe("member view save action", () => {
  it("reads the server actor before persisting a validated personal filter", async () => {
    auth.actor.mockResolvedValue({kind: "staff", userId: "staff", profileId: "staff"});
    store.save.mockImplementation(async (_actor: unknown, input: unknown) => input);
    expect(await saveMemberViewAction(idle, form({status: ["active"]}))).toEqual({status: "saved"});
    expect(store.save).toHaveBeenCalledWith(expect.objectContaining({profileId: "staff"}), expect.objectContaining({name: "Active", shared: false}));
  });

  it("rejects unknown query fields without writing", async () => {
    vi.clearAllMocks();
    auth.actor.mockResolvedValue({kind: "staff", userId: "staff", profileId: "staff"});
    expect(await saveMemberViewAction(idle, form({status: ["active"], role: "superadmin"}))).toEqual({status: "invalid"});
    expect(store.save).not.toHaveBeenCalled();
  });
});
