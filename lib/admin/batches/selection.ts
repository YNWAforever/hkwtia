import "server-only";

import {
  memberSelectionSchema,
  type MemberSelection,
} from "@/lib/admin/member-selection";
import type { AdminActor } from "@/lib/membership/lifecycle";
import type { BatchExecutor } from "@/lib/db/repos/admin-batches";
import { adminMembersRepository } from "@/lib/db/repos/admin-members";
import { requireAdmin } from "@/lib/auth/authorize";
import { batchRuntimeConfig } from "@/lib/admin/batches/types";

/** Resolve once within the existing repeatable-read preparation transaction. */
export async function resolveMemberSelectionIds(
  actor: AdminActor,
  input: MemberSelection,
  tx: BatchExecutor,
): Promise<string[]> {
  requireAdmin(actor);
  const selection = memberSelectionSchema.parse(input);
  const maxItems = batchRuntimeConfig().maxItems;
  if (selection.mode === "ids") {
    if (selection.profileIds.length > maxItems)
      throw new Error("BATCH_TOO_LARGE");
    return [...selection.profileIds];
  }
  const ids = await adminMembersRepository.snapshotSelectionIds(
    actor,
    selection.query,
    maxItems,
    tx,
  );
  const excluded = new Set(selection.excludedProfileIds);
  return ids.filter((id) => !excluded.has(id));
}
