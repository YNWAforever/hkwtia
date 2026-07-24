import "server-only";

import {portalContentRepository, type SeatOverview} from "@/lib/db/repos/portal-content";
import type {Actor} from "@/lib/membership/lifecycle";

export type {SeatOverview};

export async function getSeatOverview(actor: Actor, companyId: string): Promise<SeatOverview | null> {
  return portalContentRepository.getSeatOverview(actor, companyId);
}
