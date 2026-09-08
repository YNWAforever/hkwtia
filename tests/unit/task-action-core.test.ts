import {describe, expect, it, vi} from "vitest";

import {resolveStaffTask} from "@/lib/admin/task-action-core";

const TASK_ID = "22222222-2222-4222-8222-222222222222";

describe("resolveStaffTask", () => {
  it("requires an admin actor and a uuid id", async () => {
    const resolve = vi.fn(async () => ({id: TASK_ID, disposition: "resolved" as const}));
    await expect(resolveStaffTask({kind: "member", userId: "u", profileId: "p"}, TASK_ID, {resolve})).rejects.toThrow();
    await expect(resolveStaffTask({kind: "staff", userId: "u", profileId: "s"}, "nope", {resolve})).rejects.toThrow();
    await expect(resolveStaffTask({kind: "staff", userId: "u", profileId: "s"}, TASK_ID, {resolve})).resolves.toEqual({id: TASK_ID, disposition: "resolved"});
  });
});
