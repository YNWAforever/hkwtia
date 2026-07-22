import {describe, expect, it} from "vitest";
import {z} from "zod";

import {createAppendMemberNoteAction} from "@/lib/admin/member-note-action-core";
import type {MemberNoteFormState} from "@/components/admin/member-note-form";
import type {AdminActor} from "@/lib/membership/lifecycle";

const actor: AdminActor = {kind: "staff", userId: "staff-1", profileId: "staff-1"};
const labels = {success: "Saved", validation: "Enter a note", error: "We could not save the note."};
const initial: MemberNoteFormState = {};

describe("bound member note action", () => {
  it("uses the route profile ID when tampered FormData supplies another profile ID", async () => {
    const inputs: unknown[] = [];
    const paths: string[] = [];
    const action = createAppendMemberNoteAction({profileId: "route-member", path: "/en/admin/members/route-member", labels, dependencies: {
      actor: async () => actor,
      append: async (_actor, input) => { inputs.push(input); return "note-1"; },
      revalidate: (path) => { paths.push(path); },
    }});
    const formData = new FormData();
    formData.set("profileId", "tampered-member");
    formData.set("body", "Called about renewal");

    await expect(action(initial, formData)).resolves.toEqual({status: "success", message: labels.success});
    expect(inputs).toEqual([{profileId: "route-member", body: "Called about renewal"}]);
    expect(paths).toEqual(["/en/admin/members/route-member"]);
  });

  it("returns a localized safe error without revalidating when a repository write fails", async () => {
    const paths: string[] = [];
    const action = createAppendMemberNoteAction({profileId: "member-1", path: "/en/admin/members/member-1", labels, dependencies: {
      actor: async () => actor,
      append: async () => { throw new Error("foreign key violation for member-1"); },
      revalidate: (path) => { paths.push(path); },
    }});
    const formData = new FormData();
    formData.set("body", "Called about renewal");

    await expect(action(initial, formData)).resolves.toEqual({status: "error", message: labels.error});
    expect(paths).toEqual([]);
  });

  it("keeps localized validation failures separate and never revalidates them", async () => {
    const paths: string[] = [];
    const action = createAppendMemberNoteAction({profileId: "member-1", path: "/en/admin/members/member-1", labels, dependencies: {
      actor: async () => actor,
      append: async () => { throw new z.ZodError([]); },
      revalidate: (path) => { paths.push(path); },
    }});

    await expect(action(initial, new FormData())).resolves.toEqual({status: "error", message: labels.validation});
    expect(paths).toEqual([]);
  });

  it.each(["UNAUTHORIZED", "FORBIDDEN"])("rethrows %s so the genuine Server Action can map it to 404", async (failure) => {
    const action = createAppendMemberNoteAction({profileId: "member-1", path: "/en/admin/members/member-1", labels, dependencies: {
      actor: async () => { throw new Error(failure); },
      append: async () => "note-1",
      revalidate: () => undefined,
    }});

    await expect(action(initial, new FormData())).rejects.toThrow(failure);
  });
});