import {NextResponse} from "next/server";

import type {AppLocale} from "@/i18n/routing";
import {getActor} from "@/lib/auth/actor";
import {joinInvitesRepository} from "@/lib/db/repos/join-invites";
import {INVITE_COOKIE_NAME, inviteCookieOptions, inviteOpenAllowed} from "@/lib/membership/join-invite-cookie";
import {isWellFormedInviteToken} from "@/lib/membership/join-invite-token";
import {localizedPath} from "@/lib/urls";

type Context = Readonly<{params: Promise<Readonly<{locale: string; token: string}>>}>;

/**
 * Pages cannot set cookies in Next 16, so this handler is where the invite id leaves the database
 * and becomes the httpOnly `wtia_invite` cookie. `open` is idempotent, so re-calling it here costs
 * nothing, and any failure falls back to the invite page, which renders the neutral card.
 */
export async function GET(request: Request, {params}: Context) {
  const {locale: localeValue, token} = await params;
  const locale = localeValue as AppLocale;
  const back = () => NextResponse.redirect(new URL(localizedPath(locale, `/join/invite/${encodeURIComponent(token)}`), request.url), 303);

  if (!isWellFormedInviteToken(token) || !inviteOpenAllowed(request.headers)) return back();
  const invite = await joinInvitesRepository.open(token).catch(() => null);
  if (!invite) return back();

  // A session that cannot be resolved (auth env missing, Neon Auth down) is signed out here: the
  // member-login page it lands on can recover, and an invite page must never 500 over it.
  const actor = await getActor().catch(() => null);
  const plan = encodeURIComponent(invite.planCode);
  const destination = actor
    ? new URL(`${localizedPath(locale, "/join")}?plan=${plan}`, request.url)
    // member-login's `next` is locale-neutral; it re-prefixes on the way back.
    : new URL(`${localizedPath(locale, "/member-login")}?next=${encodeURIComponent(`/join?plan=${invite.planCode}`)}`, request.url);

  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(INVITE_COOKIE_NAME, invite.inviteId, inviteCookieOptions(invite.expiresAt));
  return response;
}
