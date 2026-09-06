"use server";

import {headers} from "next/headers";
import {z} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {auth} from "@/lib/auth/server";
import {checkAuthSend} from "@/lib/auth/rate-limit";
import {appEnv} from "@/lib/config/env";
import {isPortalContinuation, type PortalContinuation} from "@/lib/portal/continuation";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {localizedPath} from "@/lib/urls";

// Same shape as app/[locale]/(join)/join/actions.ts's emailSchema.
const emailSchema = z.string().trim().email();

export type MemberLoginResult =
  | {ok: true}
  | {ok: false; error: "invalid_email" | "invalid_continuation" | "rate_limited" | "provider_error"};

/**
 * Mirrors lib/membership/join-navigation.ts's buildJoinCallback, pointed at
 * /member-login instead of /join. Kept local rather than added to
 * join-navigation.ts, which stays Join-only per the Task 4 design boundary.
 */
function buildMemberLoginCallback(appUrl: string, locale: AppLocale, continuation: PortalContinuation): string {
  let base: URL;
  try {
    base = new URL(appUrl);
  } catch {
    throw new Error("INVALID_APP_URL");
  }
  if ((base.protocol !== "https:" && base.protocol !== "http:") || base.username || base.password || !base.hostname) {
    throw new Error("INVALID_APP_URL");
  }
  const callback = new URL(localizedPath(locale, "/member-login"), base.origin);
  callback.searchParams.set("next", continuation);
  return callback.toString();
}

export async function requestMemberLoginLink(
  input: {email: unknown; next: string | null},
  locale: AppLocale,
): Promise<MemberLoginResult> {
  const email = emailSchema.safeParse(input.email);
  if (!email.success) return {ok: false, error: "invalid_email"};

  let continuation: PortalContinuation;
  if (input.next == null) {
    continuation = "/portal";
  } else if (isPortalContinuation(input.next)) {
    continuation = input.next;
  } else {
    // Strict rejection: an out-of-allowlist `next` must fail loudly, unlike
    // parsePortalContinuation's fail-open default used by the page itself.
    return {ok: false, error: "invalid_continuation"};
  }

  // `auth.signIn.magicLink` fetches the upstream auth service directly, so it
  // never passes through our /api/auth catch-all. The shared guard has to be
  // applied here too, exactly as app/[locale]/(join)/join/actions.ts does.
  const send = checkAuthSend({
    ip: clientIpFromHeaders(await headers()),
    email: email.data,
  });
  if (!send.allowed) return {ok: false, error: "rate_limited"};

  const callbackURL = buildMemberLoginCallback(appEnv().appUrl, locale, continuation);

  try {
    const result = await auth.signIn.magicLink({email: email.data, callbackURL});
    if (result?.error) return {ok: false, error: "provider_error"};
  } catch {
    return {ok: false, error: "provider_error"};
  }

  return {ok: true};
}
