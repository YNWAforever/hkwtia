"use server";

import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {allowedMemberDestination} from "@/lib/auth/login-destination";
import {provisionVerifiedMember} from "@/lib/auth/login-provision";
import {getSession} from "@/lib/auth/server";
import {profileIdentityRepository} from "@/lib/db/repos/profile-identities";
import {localizedPath} from "@/lib/urls";

/** Retain only the bounded SQLSTATE, including a Drizzle-wrapped cause. */
function safeSqlstate(error: unknown): string | undefined {
  let current = error;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!current || typeof current !== "object") return undefined;
    const code = "code" in current ? current.code : undefined;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** No actor, role, email, or membership state arrives from the browser. */
export async function provisionMemberProfileAction(locale: AppLocale, requestedDestination?: string): Promise<void> {
  const continuation = allowedMemberDestination(requestedDestination);
  let outcome: "unverified" | "conflict" | "ready" | "forbidden" | "unavailable";
  let stage: "session" | "provision" = "session";
  let reference: string | undefined;
  try {
    const session = await getSession();
    stage = "provision";
    const result = await provisionVerifiedMember(session, (identity) => profileIdentityRepository.provisionMember(identity));
    outcome = result.kind === "ready" && result.identity.role !== "member" ? "forbidden" : result.kind;
  } catch (error) {
    reference = randomUUID();
    const sqlstate = safeSqlstate(error);
    console.error(JSON.stringify({
      event: "member_profile_provision_unavailable",
      reference,
      occurredAt: new Date().toISOString(),
      stage,
      ...(sqlstate ? {sqlstate} : {}),
    }));
    outcome = "unavailable";
  }
  if (outcome === "ready") redirect(localizedPath(locale, continuation ?? "/join"));
  const query = new URLSearchParams({profile: outcome});
  if (reference) query.set("reference", reference);
  if (continuation) query.set("next", continuation);
  redirect(`${localizedPath(locale, "/member-login")}?${query.toString()}`);
}
