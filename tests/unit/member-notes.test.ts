import {describe, expect, it} from "vitest";

import {appendMemberNote, type MemberNoteDependencies} from "@/lib/db/repos/member-notes";
import type {AdminActor, Actor} from "@/lib/membership/lifecycle";

const staffActor = (): AdminActor => ({kind: "staff", userId: "staff-1", profileId: "staff-1"});
const memberActor = (): Extract<Actor, {kind: "member"}> => ({kind: "member", userId: "member-1", profileId: "member-1"});

function fakeTransaction() {
  const committedActions: string[] = [];
  const dependencies: MemberNoteDependencies = {
    transaction: async (work) => {
      const actions: string[] = [];
      const noteId = await work({
        insertNote: async () => { actions.push("note.insert"); return "note-1"; },
        insertAudit: async () => { actions.push("audit.insert"); },
      });
      committedActions.push(...actions);
      return noteId;
    },
  };
  return {dependencies, committedActions};
}

describe("staff member notes", () => {
  it("writes the note and audit record atomically", async () => {
    const transaction = fakeTransaction();

    await expect(appendMemberNote(staffActor(), {profileId: "member-1", body: "Called about renewal"}, transaction.dependencies)).resolves.toBe("note-1");
    expect(transaction.committedActions).toEqual(["note.insert", "audit.insert"]);
  });

  it("records the staff profile as the note author without putting the note body in audit metadata", async () => {
    const calls: Array<{kind: "note" | "audit"; value: unknown}> = [];
    const dependencies: MemberNoteDependencies = {
      transaction: async (work) => work({
        insertNote: async (input) => { calls.push({kind: "note", value: input}); return "note-1"; },
        insertAudit: async (input) => { calls.push({kind: "audit", value: input}); },
      }),
    };

    await appendMemberNote(staffActor(), {profileId: "member-1", body: "  Called about renewal  ", replacesNoteId: "note-old"}, dependencies);

    expect(calls).toEqual([
      {kind: "note", value: {profileId: "member-1", authorProfileId: "staff-1", body: "Called about renewal", replacesNoteId: "note-old"}},
      {kind: "audit", value: {actorUserId: "staff-1", actorType: "staff", action: "member_note.appended", targetType: "profile", targetId: "member-1", metadata: {noteId: "note-1", replacesNoteId: "note-old"}}},
    ]);
  });

  it("denies members before any note transaction starts", async () => {
    const dependencies: MemberNoteDependencies = {transaction: async () => { throw new Error("PRIVATE_WRITE"); }};

    await expect(appendMemberNote(memberActor(), {profileId: "member-1", body: "No access"}, dependencies)).rejects.toThrow("FORBIDDEN");
  });

  it.each([{profileId: "", body: "A note"}, {profileId: "member-1", body: "   "}, {profileId: "member-1", body: "x".repeat(4001)}])("rejects malformed note input before starting a transaction", async (input) => {
    const dependencies: MemberNoteDependencies = {transaction: async () => { throw new Error("PRIVATE_WRITE"); }};

    await expect(appendMemberNote(staffActor(), input, dependencies)).rejects.toThrow();
  });
});
