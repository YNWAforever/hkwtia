import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {beforeEach, describe, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({denied: false, resend: vi.fn()}));
vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("next/navigation", () => ({notFound: () => {throw Error("NEXT_NOT_FOUND");}}));
vi.mock("@/lib/auth/actor", () => ({requireAdminActor: async () => {if (state.denied) throw Error("UNAUTHORIZED"); return {kind: "staff", userId: "synthetic-auth", profileId: "synthetic-staff"};}}));
vi.mock("@/lib/admin/ticket-resend", () => ({resendStaffPass: state.resend}));
import {resendPassAction} from "@/lib/admin/event-actions";
const seat = "11111111-1111-4111-8111-111111111111", path = "/en/admin/events-mgmt/synthetic";
const messages = {successMessage: "Accepted", errorMessage: "Refused", queuedMessage: "Queued, keep intent", uncertainMessage: "Reconcile first"};
function form(attempt: string = randomUUID()) {const data = new FormData(); data.set("attemptId", attempt); return data;}
describe("staff resend action boundary; durable/provider behaviour proved by actual PostgreSQL and native acceptance", () => {
  beforeEach(() => {state.denied = false; state.resend.mockReset(); vi.mocked(revalidatePath).mockClear();});
  it("resolves its own actor and uses the bound seat plus stable intent", async () => {
    state.resend.mockResolvedValue({status: "sent", orderId: "synthetic-order"});
    const data = form(); data.set("seatId", randomUUID()); data.set("role", "superadmin");
    expect(await resendPassAction(seat, path, messages, {}, data)).toEqual({status: "success", message: "Accepted", values: {attemptId: data.get("attemptId")}});
    expect(state.resend).toHaveBeenCalledWith({kind: "staff", userId: "synthetic-auth", profileId: "synthetic-staff"}, seat, data.get("attemptId"));
    expect(revalidatePath).toHaveBeenCalledWith(path);
  });
  it("does not replace a repeated browser intent with a fresh key", async () => {
    state.resend.mockResolvedValue({status: "queued", orderId: "synthetic-order"}); const data = form();
    await resendPassAction(seat, path, messages, {}, data); await resendPassAction(seat, path, messages, {}, data);
    expect(state.resend.mock.calls.map(x => x[2])).toEqual([data.get("attemptId"), data.get("attemptId")]);
  });
  it.each(["queued", "pending"])("%s remains truthful and cannot rotate the intent as sent", async status => {
    state.resend.mockResolvedValue({status, orderId: "synthetic-order"});
    expect(await resendPassAction(seat, path, messages, {}, form())).toEqual({status: "success", message: "Queued, keep intent"});
  });
  it("unknown effects give reconciliation instructions, without a success token", async () => {
    state.resend.mockResolvedValue({status: "uncertain", orderId: "synthetic-order"});
    expect(await resendPassAction(seat, path, messages, {}, form())).toEqual({status: "error", message: "Reconcile first"});
  });
  it.each([null, {status: "blocked", orderId: "synthetic-order"}])("refused/revoked seat is never reported sent", async result => {
    state.resend.mockResolvedValue(result); expect(await resendPassAction(seat, path, messages, {}, form())).toEqual({status: "error", message: "Refused"});
  });
  it("missing or malformed intent fails closed before the durable service", async () => {
    for (const data of [new FormData(), form("bad-intent")]) expect(await resendPassAction(seat, path, messages, {}, data)).toEqual({status: "error", message: "Refused"});
    expect(state.resend).not.toHaveBeenCalled();
  });
  it("invalid bound seat is refused before the durable service", async () => {
    expect(await resendPassAction("bad-seat", path, messages, {}, form())).toEqual({status: "error", message: "Refused"}); expect(state.resend).not.toHaveBeenCalled();
  });
  it("session denial maps to notFound and never queues or sends", async () => {
    state.denied = true; await expect(resendPassAction(seat, path, messages, {}, form())).rejects.toThrow("NEXT_NOT_FOUND"); expect(state.resend).not.toHaveBeenCalled(); expect(revalidatePath).not.toHaveBeenCalled();
  });
});
