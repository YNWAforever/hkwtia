import "server-only";

import {requestMemberships} from "@/lib/portal/request-context";
import {requireMember, type Actor} from "@/lib/membership/lifecycle";
import {classifyPortalAccess, type PortalAccessState} from "@/lib/portal/access-state";

/** Optional navigation metadata must not make own-profile or billing reads depend on entitlement availability. */
export async function getPortalNavigationAccess(actor: Actor): Promise<PortalAccessState | {status: "unavailable"}> {
  requireMember(actor);
  try {
    return classifyPortalAccess(await requestMemberships(actor));
  } catch {
    // No actor identifiers, driver messages or connection details enter this log.
    console.error("PORTAL_NAVIGATION_ACCESS_UNAVAILABLE");
    return {status: "unavailable"};
  }
}
