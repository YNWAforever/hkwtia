"use server";

import {revalidatePath} from "next/cache";

import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {approveCompanyProfile, rejectCompanyProfile} from "@/lib/admin/profile-review-core";
import {requireAdminActor} from "@/lib/auth/actor";

// Every export here is an HTTP-callable endpoint, so each one must resolve its
// own actor from the session. The actor-taking cores live in
// lib/admin/profile-review-core.ts precisely so they cannot be dispatched directly.

/**
 * A decision either puts a member page on `/members` or takes it off, so the
 * directory and that member's own page must both drop their cache.
 * `revalidatePath` takes the internal app-router path, where `/zh-HK/…` is
 * correct (unlike an href, which goes through `localizedPath`).
 *
 * The slug is optional because `companies.slug` is nullable: a rejection can
 * decide a profile that never had one, and there is no page to invalidate then.
 * An approval always has one — `companyProfilesRepository.review` refuses to
 * publish without it — so the detail paths are skipped only when there is
 * genuinely nothing addressable behind them.
 */
function afterReview(path: string, slug: string | null | undefined): void {
  revalidateAdminPath(path);
  revalidatePath("/en/members");
  revalidatePath("/zh-HK/members");
  if (!slug) return;
  revalidatePath(`/en/members/${slug}`);
  revalidatePath(`/zh-HK/members/${slug}`);
}

export async function approveCompanyProfileAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  const {slug} = await approveCompanyProfile(actor, formData.get("companyId"));
  afterReview(path, slug);
}

export async function rejectCompanyProfileAction(path: string, formData: FormData): Promise<void> {
  const actor = await requireAdminActor();
  const {slug} = await rejectCompanyProfile(actor, formData.get("companyId"), formData.get("rejectionReason"));
  afterReview(path, slug);
}
