"use server";

import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";

import type {AppLocale} from "@/i18n/routing";
import {provisionVerifiedMember} from "@/lib/auth/login-provision";
import {getSession} from "@/lib/auth/server";
import {profileIdentityRepository} from "@/lib/db/repos/profile-identities";
import {localizedPath} from "@/lib/urls";

/** No actor, role, email, or membership state arrives from the browser. */
export async function provisionMemberProfileAction(locale: AppLocale): Promise<void> {
  let outcome: "unverified" | "conflict" | "ready" | "forbidden" | "unavailable";
  try {
    const result = await provisionVerifiedMember(await getSession(), (identity) => profileIdentityRepository.provisionMember(identity));
    outcome = result.kind === "ready" && result.identity.role !== "member" ? "forbidden" : result.kind;
  } catch {
    const reference = randomUUID();
    console.error(JSON.stringify({event: "member_profile_provision_unavailable", reference, occurredAt: new Date().toISOString()}));
    outcome = "unavailable";
  }
  if (outcome === "ready") redirect(localizedPath(locale, "/join"));
  redirect(`${localizedPath(locale, "/member-login")}?profile=${outcome}`);
}
