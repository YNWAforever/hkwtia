"use server";

import {notFound} from "next/navigation";

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {
  approveTemplate,
  disableTemplate,
  rejectTemplate,
  saveTemplatePreviews,
} from "@/lib/admin/template-registry-core";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

// Every export here is an HTTP-callable endpoint, so each one resolves its own
// actor from the session. The actor-taking cores live in
// lib/admin/template-registry-core.ts precisely so they cannot be dispatched
// directly, and no parameter below may be named `actor`, `_actor`, `adminActor`
// or `sessionActor` whatever its type —
// tests/unit/server-action-actor-boundary.test.ts flags those names as well as
// the `Actor` type. Every runtime export must also be a provably-async function,
// so there are no constants, no arrays and no error-code lists in this file.

function text(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

export async function approveTemplateAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await approveTemplate(who, text(formData, "key"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function rejectTemplateAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await rejectTemplate(who, text(formData, "key"), text(formData, "rejectionReason"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function disableTemplateAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await disableTemplate(who, text(formData, "key"), text(formData, "rejectionReason"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function saveTemplatePreviewsAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    // Only the two locales the repository's schema accepts are forwarded; an
    // unknown key would be a ZodError the reviewer reads as a 500, and a preview
    // is staff-authored copy rather than anything the provider ever sees.
    await saveTemplatePreviews(who, text(formData, "key"), {
      en: text(formData, "previewEn") ?? "",
      "zh-HK": text(formData, "previewZhHk") ?? "",
    });
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
