"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";

import {requireAdminActor} from "@/lib/auth/actor";
import {refundOrder, type RefundResult} from "@/lib/tickets/refund-core";

export type RefundOrderState = Readonly<{status: "idle"} | {status: "ok"; message: string} | {status: "error"; message: string}>;

const refundInput = z.object({orderId: z.string().uuid(), note: z.string().trim().max(500).optional()}).strict();

const messages: Readonly<Record<RefundResult["status"], string>> = {
  refunded: "Refunded.",
  already_refunded: "This order was already refunded.",
  not_admissible: "This order is not payable, so there is nothing to refund.",
  provider_failed: "The refund did not go through, so nothing was charged back. You can try again.",
  not_found: "That order could not be found.",
};

export async function submitRefundOrderAction(eventPath: string, _previous: RefundOrderState, formData: FormData): Promise<RefundOrderState> {
  const actor = await requireAdminActor();
  const parsed = refundInput.safeParse({orderId: formData.get("orderId"), note: formData.get("note") ?? undefined});
  if (!parsed.success) return {status: "error", message: messages.not_found};
  const result = await refundOrder(actor, parsed.data);
  // The page binds the internal path, the way `createEventAction.bind(null, path, …)`
  // does; revalidating it refreshes both the Orders row and the door list, which
  // change together when a refund lands.
  revalidatePath(eventPath);
  return result.status === "refunded"
    ? {status: "ok", message: messages.refunded}
    : {status: "error", message: messages[result.status]};
}
