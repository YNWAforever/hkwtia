import {redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import type {PortalContinuation} from "@/lib/portal/continuation";
import {localizedPath} from "@/lib/urls";

/** The dedicated member sign-in path for a signed-out Portal visitor, returning to `continuation`. */
export function memberLoginPath(locale: AppLocale, continuation: string): string {
  const query = new URLSearchParams({next: continuation});
  return `${localizedPath(locale, "/member-login")}?${query.toString()}`;
}

/**
 * The actor for a Portal page, or a redirect to member sign-in back to this page.
 *
 * The layout redirects signed-out visitors too, but Next renders layout and page in parallel, so
 * a page-level `requireActor()` threw UNAUTHORIZED into the runtime log on every signed-out hit
 * (audit F21). And on a direct visit the layout cannot see the requested path, so its redirect
 * always returned the member to `/portal`. Each page therefore names its own continuation.
 * Server actions keep `requireActor()`: they have no layout to redirect for them.
 */
export async function portalPageActor(locale: AppLocale, continuation: PortalContinuation) {
  const actor = await getActor();
  if (!actor) redirect(memberLoginPath(locale, continuation));
  return actor;
}
