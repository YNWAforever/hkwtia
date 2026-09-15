import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  session: {kind: "staff", userId: "auth-1", profileId: "p-1"} as unknown,
  noSession: false,
  checkInResult: {disposition: "checked_in"} as {disposition: string},
  undoResult: {disposition: "undone"} as {disposition: string},
  checkInCalls: [] as Array<{actor: unknown; input: unknown}>,
  undoCalls: [] as Array<{actor: unknown; input: unknown}>,
}));

vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => {
    if (state.noSession) throw new Error("UNAUTHORIZED");
    return state.session;
  },
}));

vi.mock("@/lib/db/repos/ticket-check-in", () => ({
  ticketCheckInRepository: {
    checkInSeat: async (actor: unknown, input: unknown) => {
      state.checkInCalls.push({actor, input});
      return state.checkInResult;
    },
    undoSeatCheckIn: async (actor: unknown, input: unknown) => {
      state.undoCalls.push({actor, input});
      return state.undoResult;
    },
  },
}));

const SEAT_ID = "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f";

function form(seatId: string = SEAT_ID): FormData {
  const data = new FormData();
  data.set("seatId", seatId);
  return data;
}

function loadActions() {
  return import("@/lib/tickets/check-in-actions");
}

describe("the check-in action module boundary", () => {
  it("exports only the two formData wrappers", async () => {
    const actions = await loadActions();

    expect(Object.keys(actions).sort()).toEqual([
      "submitSeatCheckInAction",
      "submitSeatUndoAction",
    ]);
  });
});

describe("submitSeatCheckInAction", () => {
  beforeEach(() => {
    state.noSession = false;
    state.checkInResult = {disposition: "checked_in"};
    state.undoResult = {disposition: "undone"};
    state.checkInCalls = [];
    state.undoCalls = [];
  });

  // `requireAdminActor` throws UNAUTHORIZED, which the shared core rethrows
  // rather than turning into a state: an authorization denial must not be
  // reportable as a normal outcome. The repository is never reached.
  it("refuses without a staff session and never reaches the repository", async () => {
    state.noSession = true;
    const {submitSeatCheckInAction} = await loadActions();

    await expect(submitSeatCheckInAction({}, form())).rejects.toThrow("UNAUTHORIZED");
    expect(state.checkInCalls).toHaveLength(0);
  });

  it("refuses a seatId that is not a uuid without reaching the repository", async () => {
    const {submitSeatCheckInAction} = await loadActions();

    await expect(submitSeatCheckInAction({}, form("not-a-uuid"))).resolves.toEqual({
      status: "error",
      message: "Could not update this seat.",
    });
    expect(state.checkInCalls).toHaveLength(0);
  });

  it("checks the seat in and reports success", async () => {
    const {submitSeatCheckInAction} = await loadActions();

    await expect(submitSeatCheckInAction({}, form())).resolves.toEqual({
      status: "success",
      message: "Checked in.",
    });
    expect(state.checkInCalls).toEqual([{actor: state.session, input: {seatId: SEAT_ID}}]);
  });

  it("reports an already-checked-in seat as success, not an error", async () => {
    state.checkInResult = {disposition: "already_checked_in"};
    const {submitSeatCheckInAction} = await loadActions();

    await expect(submitSeatCheckInAction({}, form())).resolves.toEqual({
      status: "success",
      message: "Already checked in.",
    });
  });

  it("reports an inadmissible seat as an error", async () => {
    state.checkInResult = {disposition: "not_admissible"};
    const {submitSeatCheckInAction} = await loadActions();

    await expect(submitSeatCheckInAction({}, form())).resolves.toEqual({
      status: "error",
      message: "This seat is not admissible.",
    });
  });
});

describe("submitSeatUndoAction", () => {
  beforeEach(() => {
    state.noSession = false;
    state.checkInResult = {disposition: "checked_in"};
    state.undoResult = {disposition: "undone"};
    state.checkInCalls = [];
    state.undoCalls = [];
  });

  it("undoes a check-in and reports it", async () => {
    const {submitSeatUndoAction} = await loadActions();

    await expect(submitSeatUndoAction({}, form())).resolves.toEqual({
      status: "success",
      message: "Check-in undone.",
    });
    expect(state.undoCalls).toEqual([{actor: state.session, input: {seatId: SEAT_ID}}]);
  });

  // A seat that was never checked in has nothing to undo, but it is not a
  // failure: the caller asked for a state the seat is already in.
  it("reports a not_checked_in seat without an error state", async () => {
    state.undoResult = {disposition: "not_checked_in"};
    const {submitSeatUndoAction} = await loadActions();

    const result = await submitSeatUndoAction({}, form());

    expect(result.status).toBe("success");
  });

  it("refuses without a staff session and never reaches the repository", async () => {
    state.noSession = true;
    const {submitSeatUndoAction} = await loadActions();

    await expect(submitSeatUndoAction({}, form())).rejects.toThrow("UNAUTHORIZED");
    expect(state.undoCalls).toHaveLength(0);
  });
});
