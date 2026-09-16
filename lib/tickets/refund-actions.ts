"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireAdminActor} from "@/lib/auth/actor";
import {refundOrder, type RefundResult} from "@/lib/tickets/refund-core";

export type RefundOrderState = Readonly<{status: "idle"} | {status: "ok"; message: string} | {status: "error"; message: string}>;

/**
 * The five outcome strings, resolved by the page from `Admin.eventsMgmt.orders.refundOutcomes`
 * and bound in, exactly as `submitSeatCheckInAction` receives its `SeatCheckInMessages`.
 * The action holds no user-visible copy of its own: a hard-coded English literal here would
 * render untranslated on the zh-HK staff pages, and this is a `.ts` module the visible-string
 * audit does not scan.
 */
export type RefundOutcomeMessages = Readonly<{
  refunded: string;
  alreadyRefunded: string;
  notAdmissible: string;
  providerFailed: string;
  commitFailed: string;
  notFound: string;
}>;

const refundInput = z.object({orderId: z.string().uuid(), note: z.string().trim().max(500).optional()}).strict();

const messageKey: Readonly<Record<RefundResult["status"], keyof RefundOutcomeMessages>> = {
  refunded: "refunded",
  already_refunded: "alreadyRefunded",
  not_admissible: "notAdmissible",
  provider_failed: "providerFailed",
  commit_failed: "commitFailed",
  not_found: "notFound",
};

/** An untouched note input submits `""`, which means "no note" -- `null` in the audit row. */
function noteFrom(formData: FormData): string | undefined {
  const value = formData.get("note");
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export async function submitRefundOrderAction(eventPath: string, messages: RefundOutcomeMessages, _previous: RefundOrderState, formData: FormData): Promise<RefundOrderState> {
  const actor = await requireAdminActor();
  const parsed = refundInput.safeParse({orderId: formData.get("orderId"), note: noteFrom(formData)});
  if (!parsed.success) return {status: "error", message: messages.notFound};
  const result = await refundOrder(actor, parsed.data);
  // The page binds the internal path, the way `createEventAction.bind(null, path, …)`
  // does; revalidating it refreshes both the Orders row and the door list. A refusal
  // changed nothing, so it does not revalidate -- the rule `submitSeatCheckInAction`
  // follows for `not_admissible`. `already_refunded` can mean another staff member won
  // the race, so the page is refreshed in case this one is stale.
  if (result.status === "refunded" || result.status === "already_refunded") revalidatePath(eventPath);
  return result.status === "refunded"
    ? {status: "ok", message: messages.refunded}
    : {status: "error", message: messages[messageKey[result.status]]};
}
