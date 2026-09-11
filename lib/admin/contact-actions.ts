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
// C-4's `linkContactToProfileAction` is NOT here yet: the merge it would call,
// `contactsRepository.linkProfile`, is Phase C2 Task 5's (merge-on-write, S-16),
// and an exported wrapper around a method that does not exist is a published
// endpoint that 500s. It lands with the repository method, in that task.

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
