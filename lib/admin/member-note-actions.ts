"use server";

import type {MemberNoteFormState} from "@/components/admin/member-note-form";
import {createAppendMemberNoteAction} from "@/lib/admin/member-note-action-core";
import {requireAdminActor} from "@/lib/auth/actor";
import {appendMemberNote} from "@/lib/db/repos/member-notes";
import {revalidatePath} from "next/cache";

export async function appendMemberNoteAction(profileId: string, path: string, labels: {success: string; validation: string; error: string}, previousState: MemberNoteFormState, formData: FormData): Promise<MemberNoteFormState> {
  return createAppendMemberNoteAction({
    profileId,
    path,
    labels,
    dependencies: {actor: requireAdminActor, append: appendMemberNote, revalidate: revalidatePath},
  })(previousState, formData);
}