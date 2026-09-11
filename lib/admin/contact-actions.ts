"use server";

import {notFound, redirect} from "next/navigation";

import {
  contactPipelineInput,
  contactReturnPath,
  updateContactPipeline,
} from "@/lib/admin/contact-action-core";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

// Every export here is an HTTP-callable endpoint, so each one resolves its own
// actor from the session. The actor-taking cores live in
// lib/admin/contact-action-core.ts precisely so they cannot be dispatched
// directly, and no parameter below may be named `actor`, `_actor`, `adminActor`
// or `sessionActor` whatever its type —
// tests/unit/server-action-actor-boundary.test.ts flags those names as well as
// the `Actor` type. Every runtime export must also be a provably-async function,
// so the form parser and the return-path allowlist live in the core module.
//
// C-4's `linkContactToProfileAction` is still NOT here, and Task 5 — which
// landed `contactsRepository.linkProfile` — is where that stopped being a
// question of the method existing. The merge matches on an IDENTITY (member id,
// then number, then address) and needs the profile it is linking TO; a row on
// this page whose `profileId` is null is by definition one we could not match,
// and the table carries no profile picker and no `whatsappMemberId` to feed
// `reconcileWhatsAppMemberId` either. An exported action is a published HTTP
// endpoint, so wiring one to a control that cannot supply its input would
// publish a merge anybody could aim at any profile — the failure the repository
// is careful to make impossible (guessing merges two people's threads).
// Spec C-4 asks for merge-on-login, which S-16 implements as merge-on-write;
// the manual trigger needs a picker UI and its own strings, and belongs with
// whatever task adds them.

export async function updateContactPipelineAction(path: string, formData: FormData): Promise<void> {
  let back: string | null = null;
  try {
    const who = await requireAdminActor();
    const contactId = formData.get("contactId");
    await updateContactPipeline(who, contactId, contactPipelineInput(formData));
    revalidateAdminPath(path);
    back = contactReturnPath(formData.get("returnTo"));
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
  // Outside the `try`: `redirect` signals by throwing NEXT_REDIRECT, and a
  // catch block that inspected it first would be one refactor away from
  // swallowing the navigation and leaving the save silently unconfirmed.
  if (back !== null) redirect(back);
}
