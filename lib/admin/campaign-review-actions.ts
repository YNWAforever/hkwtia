"use server";

import {notFound, redirect} from "next/navigation";

import {
  approveCampaign,
  rejectCampaign,
  submitCampaignForReview,
} from "@/lib/admin/campaign-review-core";
import {campaignDetailPath, campaignDraftInput, createCampaignDraft} from "@/lib/admin/campaign-wizard";
import {revalidateAdminPath} from "@/lib/admin/revalidate-path";
import {requireAdminActor} from "@/lib/auth/actor";
import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";

// Every export here is an HTTP-callable endpoint, so each one resolves its own
// actor from the session. The actor-taking cores live in
// lib/admin/campaign-review-core.ts and lib/admin/campaign-wizard.ts precisely
// so they cannot be dispatched directly, and no parameter below may be named
// `actor`, `_actor`, `adminActor` or `sessionActor` whatever its type —
// tests/unit/server-action-actor-boundary.test.ts flags those names as well as
// the `Actor` type. Every runtime export must also be a provably-async
// function, so the form parser and the redirect allowlist live in
// campaign-wizard.ts rather than beside the wrappers that use them.
//
// This is the module that decides whether a marketing blast goes out, so the
// denial path matters as much as the happy one: a `notFound()` keeps the
// campaign surface from confirming its own existence to a caller who is not
// staff, and every wrapper below re-throws anything that is not an
// authorization denial rather than reporting a failed write as a success.

export async function createCampaignDraftAction(path: string, basePath: string, formData: FormData): Promise<void> {
  let detail: string | null = null;
  try {
    const who = await requireAdminActor();
    const draft = await createCampaignDraft(who, campaignDraftInput(formData));
    revalidateAdminPath(path);
    detail = campaignDetailPath(basePath, draft.campaignId);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
  // Outside the `try`: `redirect` signals by throwing NEXT_REDIRECT, and a
  // catch block that inspected it first would be one refactor away from
  // swallowing the navigation and leaving a created draft unreachable.
  if (detail !== null) redirect(detail);
}

export async function submitCampaignForReviewAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await submitCampaignForReview(who, formData.get("campaignId"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function approveCampaignAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    // `scheduledAt` is absent for an email campaign, whose screen renders no
    // send-time field: `approveCampaign` refuses one rather than accepting a
    // schedule nothing would ever promote.
    await approveCampaign(who, formData.get("campaignId"), formData.get("scheduledAt"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}

export async function rejectCampaignAction(path: string, formData: FormData): Promise<void> {
  try {
    const who = await requireAdminActor();
    await rejectCampaign(who, formData.get("campaignId"), formData.get("rejectionReason"));
    revalidateAdminPath(path);
  } catch (error) {
    if (isAuthorizationDenial(error)) notFound();
    throw error;
  }
}
