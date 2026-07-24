"use server";

import {revalidatePath} from "next/cache";
import {notFound} from "next/navigation";

import {runSegmentSaveAction, type SegmentSaveActionMessages, type SegmentSaveActionState} from "@/lib/admin/segment-action-core";
import {saveSegment} from "@/lib/admin/segments";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
import {requireAdminActor} from "@/lib/auth/actor";

export async function saveSegmentAction(path: string, messages: SegmentSaveActionMessages, state: SegmentSaveActionState, formData: FormData): Promise<SegmentSaveActionState> {
  try {
    const actor = await requireAdminActor();
    return await runSegmentSaveAction(state, formData, {messages, mutate: async (input) => {
      await saveSegment(actor, input);
      revalidatePath(path);
    }});
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
