import "server-only";

import {portalContentRepository, type SeatOverview} from "@/lib/db/repos/portal-content";
import type {Actor} from "@/lib/membership/lifecycle";

export type {SeatOverview};

export async function getSeatOverview(actor: Actor, companyId: string): Promise<SeatOverview | null> {
  return portalContentRepository.getSeatOverview(actor, companyId);
}
export async function getRecentSeatInviteBatches(actor: Actor, companyId: string) {
  const {listRecentSeatInviteBatches} = await import("@/lib/db/repos/seat-invite-batches");
  return listRecentSeatInviteBatches(actor, companyId);
}
