import "server-only";

import type {MemberSelection} from "@/lib/admin/member-selection";
import type {AdminActor} from "@/lib/membership/lifecycle";
import type {BatchExecutor} from "@/lib/db/repos/admin-batches";
import {adminMembersRepository} from "@/lib/db/repos/admin-members";
import {batchRuntimeConfig} from "@/lib/admin/batches/types";

/** Resolve a selection exactly once under T13's repeatable-read preparation transaction. */
export async function resolveMemberSelectionIds(actor: AdminActor, selection: MemberSelection, tx: BatchExecutor): Promise<string[]> {
  if (selection.mode === "ids") return [...selection.profileIds];
  const ids: string[] = [];
  const excluded = new Set(selection.excludedProfileIds);
  let cursor: string | null = null;
  for (;;) {
    const page = await adminMembersRepository.search(actor, {...selection.query, cursor, limit: 50}, tx);
    if (page.totalMatching > batchRuntimeConfig().maxItems) throw new Error("BATCH_TOO_LARGE");
    ids.push(...page.items.map((item) => item.profileId).filter((id) => !excluded.has(id)));
    if (ids.length > batchRuntimeConfig().maxItems) throw new Error("BATCH_TOO_LARGE");
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return ids;
}
