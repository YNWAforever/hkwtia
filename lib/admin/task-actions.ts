"use server";

import {revalidatePath} from "next/cache";

import {resolveStaffTask} from "@/lib/admin/task-action-core";

export async function resolveStaffTaskAction(formData: FormData): Promise<void> {
  const {requireAdminActor} = await import("@/lib/auth/actor");
  const actor = await requireAdminActor();
  await resolveStaffTask(actor, formData.get("taskId"));
  // revalidatePath takes the internal locale path (CLAUDE.md boundary #5 exception).
  revalidatePath("/en/admin/tasks");
  revalidatePath("/zh-HK/admin/tasks");
  revalidatePath("/en/admin");
  revalidatePath("/zh-HK/admin");
}
