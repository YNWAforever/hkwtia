import "server-only";
import {getMemberEventById, localizeEvent} from "@/lib/db/repos/events";
import {membershipsRepository} from "@/lib/db/repos/memberships";
import type {Event} from "@/lib/db/server-schema";
import {requireMember, type Actor, type MembershipRecord} from "@/lib/membership/lifecycle";
import {classifyPortalAccess, PortalAccessDenied} from "@/lib/portal/access-state";
import {ticketPurchaseAudience} from "@/lib/tickets/eligibility";

type Dependencies = Readonly<{
  listMemberships: (actor: Actor) => Promise<readonly Pick<MembershipRecord, "status" | "companyId">[]>;
  readEvent: (actor: Actor, eventId: string) => Promise<Event | null>;
}>;
const defaults: Dependencies = {listMemberships: membershipsRepository.list, readEvent: getMemberEventById};
export async function getPortalEvent(actor: Actor, eventId: string, locale: string, deps: Dependencies = defaults) {
  requireMember(actor);
  const access = classifyPortalAccess(await deps.listMemberships(actor));
  if (access.status !== "ready") throw new PortalAccessDenied({status: access.status});
  const event = await deps.readEvent(actor, eventId);
  if (!event || !event.published || event.status !== "published" || ticketPurchaseAudience(event) === "invite_only") return null;
  return {...localizeEvent(event, locale), ticketPriceHkdCents: event.ticketPriceHkdCents};
}
