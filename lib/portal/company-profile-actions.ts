"use server";

import {revalidatePath} from "next/cache";
import {ZodError} from "zod";

import type {AppLocale} from "@/i18n/routing";
import {saveCompanyProfile, submitCompanyProfile} from "@/lib/portal/company-profile-core";

// Only the formData wrapper is exported here, and it resolves its own actor
// from the session. The actor-taking cores live in `company-profile-core.ts`:
// `"use server"` publishes every export as an HTTP endpoint, so an exported
// `fn(actor, …)` would accept a forged one.
export type CompanyProfileFormState = Readonly<{status: "idle" | "saved" | "submitted" | "error"; code?: string}>;

// The codes the form has copy for. Anything else — a zod issue, a driver
// error, COMPANY_NOT_FOUND — becomes INVALID rather than leaking its message
// to the member.
const knownCodes = new Set([
  "FORBIDDEN", "NO_MANAGED_COMPANY", "INVALID_PROFILE_TRANSITION", "COMPANY_SLUG_TAKEN", "COMPANY_LOGO_INVALID",
]);

function errorCode(error: unknown): string {
  // Every field rule (slug shape, tag vocabulary, https website) is a zod issue
  // in the repository, and each of them is "check what you typed" to a member.
  if (error instanceof ZodError) return "INVALID";
  const code = error instanceof Error ? error.message : "UNKNOWN";
  return knownCodes.has(code) ? code : "INVALID";
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** Empty means "cleared", not "unchanged": the repository stores null and the public page renders nothing. */
function optional(formData: FormData, key: string): string | null {
  const value = text(formData, key);
  return value.length > 0 ? value : null;
}

function companyProfileInputFromFormData(formData: FormData) {
  return {
    slug: text(formData, "slug"),
    taglineEn: optional(formData, "taglineEn"),
    taglineZhHk: optional(formData, "taglineZhHk"),
    descriptionZhHk: optional(formData, "descriptionZhHk"),
    website: optional(formData, "website"),
    logoMediaId: optional(formData, "logoMediaId"),
    // Checkboxes all named `tags`; the repository refuses anything outside
    // `config/industry-tags.ts`, so a hand-posted value cannot get in.
    tags: formData.getAll("tags").map(String),
  };
}

/**
 * One action for both buttons, as in `lib/events/member-actions.ts`: the
 * submitter's `intent` decides whether the save is followed by "publish my
 * profile", so the form carries a single action state and a failed submission
 * can never be mistaken for a failed save.
 *
 * Publishing saves first on purpose. A member who has just typed a page address
 * and pressed Publish would otherwise hit INVALID_PROFILE_TRANSITION, because
 * `submitForReview` requires a slug that is already stored.
 */
export async function saveCompanyProfileAction(
  locale: AppLocale,
  _state: CompanyProfileFormState,
  formData: FormData,
): Promise<CompanyProfileFormState> {
  const {requireActor} = await import("@/lib/auth/actor");
  const actor = await requireActor();
  const publish = formData.get("intent") === "publish";
  try {
    await saveCompanyProfile(actor, companyProfileInputFromFormData(formData));
    if (publish) await submitCompanyProfile(actor);
  } catch (error) {
    return {status: "error", code: errorCode(error)};
  }
  // `revalidatePath` takes the internal app-router path, where `/zh-HK/…` is
  // correct — it is the one place a hand-built locale prefix belongs. The
  // directory is revalidated in both locales because an approved edit changes
  // what /members shows, and a demoted one removes the page from it.
  revalidatePath(`/${locale}/portal/company`);
  revalidatePath("/en/members");
  revalidatePath("/zh-HK/members");
  return {status: publish ? "submitted" : "saved"};
}
