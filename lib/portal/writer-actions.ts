"use server";

import {requireActor} from "@/lib/auth/actor";
import {runWriterAssist, type WriterActionState} from "@/lib/portal/writer-action-core";

export type {WriterActionState};

/**
 * Only the formData-shaped wrapper is exported. `"use server"` publishes every
 * export as an HTTP endpoint, so an exported `runWriterAssist(actor, …)` would
 * accept a forged actor and spend somebody else's quota.
 */
export async function writerAssistAction(
  _state: WriterActionState | null,
  formData: FormData,
): Promise<WriterActionState> {
  const actor = await requireActor();
  return runWriterAssist(actor, {
    kind: formData.get("kind"),
    brief: formData.get("brief"),
  });
}
