import {describe, expect, it, vi} from "vitest";

import {createStaffTasksRepository} from "@/lib/db/repos/staff-tasks";

const admin = {kind: "staff" as const, userId: "u", profileId: "staff-1"};
const TASK_ID = "22222222-2222-4222-8222-222222222222";

describe("staffTasksRepository admin reads and resolve", () => {
  it("lists open tasks newest first for an admin and refuses a member", async () => {
    const execute = vi.fn(async () => [{id: TASK_ID, profile_id: null, journey_state_id: null, kind: "concierge_escalation", dedupe_key: "k", summary_code: "provider_handoff", context: {conversationId: "c1", reasonCode: "provider_handoff", locale: "en"}, status: "open", resolved_at: null, resolved_by_profile_id: null, created_at: new Date(), updated_at: new Date()}]);
    const repository = createStaffTasksRepository(async () => ({execute, transaction: vi.fn()}) as never);
    const tasks = await repository.listOpen(admin);
    expect(tasks[0]).toMatchObject({id: TASK_ID, kind: "concierge_escalation", summaryCode: "provider_handoff", status: "open"});
    await expect(repository.listOpen({kind: "member", userId: "u", profileId: "p"} as never)).rejects.toThrow();
  });

  it("resolves a task and records who did it", async () => {
    const execute = vi.fn(async () => [{id: TASK_ID}]);
    const repository = createStaffTasksRepository(async () => ({execute, transaction: vi.fn()}) as never);
    await expect(repository.resolve(admin, TASK_ID)).resolves.toEqual({id: TASK_ID, disposition: "resolved"});
  });

  it("reports an already-resolved task without throwing", async () => {
    const execute = vi.fn(async () => []);
    const repository = createStaffTasksRepository(async () => ({execute, transaction: vi.fn()}) as never);
    await expect(repository.resolve(admin, TASK_ID)).resolves.toEqual({id: TASK_ID, disposition: "already_resolved"});
  });
});
