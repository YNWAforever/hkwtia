import {render, screen} from "@testing-library/react";
import {beforeEach, describe, expect, it, vi} from "vitest";

const state = vi.hoisted(() => ({
  actor: {kind: "staff", userId: "staff-1", profileId: "staff-1"},
  actorError: null as string | null,
  moveApplication: vi.fn(),
}));

vi.mock("next/cache", () => ({revalidatePath: vi.fn()}));
vi.mock("@/lib/auth/actor", () => ({
  requireAdminActor: async () => {
    if (state.actorError) throw new Error(state.actorError);
    return state.actor;
  },
}));
vi.mock("@/lib/db/repos/cohorts", () => ({
  cohortRepository: {
    moveApplication: (...args: unknown[]) => state.moveApplication(...args),
  },
}));

import {CohortKanban} from "@/components/admin/cohort-kanban";
import {moveCohortApplicationAction} from "@/lib/admin/cohort-actions";
import {revalidatePath} from "next/cache";

const applicationId = "11111111-1111-4111-8111-111111111111";
const cohortId = "22222222-2222-4222-8222-222222222222";
const companyId = "33333333-3333-4333-8333-333333333333";

const labels = {
  title: "Cohort applications",
  description: "Move applications through the launch journey.",
  application: "Application",
  moveTo: "Move to",
  notes: "Staff note",
  move: "Move application",
  moving: "Moving application",
  empty: "No applications in this stage.",
  stages: {
    applied: "Applied", accepted: "Accepted", ready: "Ready", match: "Match",
    land: "Land", scale: "Scale", graduated: "Graduated", rejected: "Rejected",
  },
  errors: {invalid: "Check the application move.", forbidden: "You do not have access.", error: "The application could not be moved."},
};

function form(path = "/admin/cohorts", stage = "accepted", notes = "Ready for review") {
  const data = new FormData();
  data.set("applicationId", applicationId);
  data.set("stage", stage);
  data.set("notes", notes);
  return [path, data] as const;
}

describe("M6 staff cohort kanban", () => {
  beforeEach(() => {
    state.actor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};
    state.actorError = null;
    state.moveApplication = vi.fn(async () => ({id: applicationId, stage: "accepted"}));
    vi.mocked(revalidatePath).mockClear();
  });

  it("moves a valid application exclusively through the staff repository boundary", async () => {
    const [path, data] = form();

    await expect(moveCohortApplicationAction(path, data)).resolves.toEqual({status: "success"});
    expect(state.moveApplication).toHaveBeenCalledWith(state.actor, applicationId, "accepted", "Ready for review");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/cohorts");
  });

  it("rejects a non-admin action before any cohort mutation", async () => {
    state.actorError = "FORBIDDEN";
    const [path, data] = form();

    await expect(moveCohortApplicationAction(path, data)).resolves.toEqual({status: "forbidden"});
    expect(state.moveApplication).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a safe invalid status when the repository rejects a transition", async () => {
    state.moveApplication = vi.fn(async () => { throw new Error("INVALID_COHORT_STAGE_TRANSITION"); });
    const [path, data] = form();

    await expect(moveCohortApplicationAction(path, data)).resolves.toEqual({status: "invalid"});
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects malformed input and non-canonical locale paths before mutation", async () => {
    const [path, data] = form("/zh-HK/admin/cohorts", "not-a-stage");

    await expect(moveCohortApplicationAction(path, data)).resolves.toEqual({status: "invalid"});
    expect(state.moveApplication).not.toHaveBeenCalled();
  });

  it("renders every persisted stage with keyboard-accessible legal move controls and no private readiness data", () => {
    render(<CohortKanban
      applications={[{id: applicationId, cohortId, companyId, stage: "applied", readiness: {contactEmail: "private@example.test"}, notes: "private note", createdAt: new Date(), updatedAt: new Date()}] as never}
      labels={labels}
      moveAction={async () => ({status: "success"})}
    />);

    for (const stage of Object.values(labels.stages)) expect(screen.getByRole("heading", {name: stage})).toBeInTheDocument();
    expect(screen.getByLabelText(`${labels.moveTo}: ${applicationId}`)).toHaveAttribute("name", "stage");
    expect(screen.getByLabelText(`${labels.notes}: ${applicationId}`)).toHaveAttribute("name", "notes");
    expect(screen.getByRole("button", {name: labels.move})).toBeInTheDocument();
    expect(screen.queryByText("private@example.test")).not.toBeInTheDocument();
    expect(screen.queryByText("private note")).not.toBeInTheDocument();
  });
});
