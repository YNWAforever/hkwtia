import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import type {Actor} from "@/lib/membership/lifecycle";
import {deliverTicketEmailsForOrder, productionTicketEmailDependencies, type TicketEmailRunnerDependencies} from "@/lib/billing/ticket-email-runner";
import {ticketEmailOutboxRepository, type StaffPassNotice} from "@/lib/db/repos/ticket-email-outbox";

type Dependencies = Readonly<{
  outbox: Pick<typeof ticketEmailOutboxRepository, "queueStaffPass" | "staffPassStatus">;
  runner: () => TicketEmailRunnerDependencies;
}>;
/** Reuses settlement's durable outbox; a provider acceptance is not a delivery receipt. */
export async function resendStaffPass(actor: Actor, seatId: string, attemptId: string,
  dependencies: Dependencies = {outbox: ticketEmailOutboxRepository, runner: productionTicketEmailDependencies},
): Promise<StaffPassNotice | null> {
  requireAdmin(actor);
  const notice = await dependencies.outbox.queueStaffPass(actor, seatId, attemptId);
  if (!notice || notice.status !== "queued") return notice;
  try {await deliverTicketEmailsForOrder(notice.orderId, dependencies.runner());}
  catch {
    // The durable claim survives configuration/ledger failures. Preserve the
    // same intent rather than inventing a successful send or a new attempt.
  }
  return await dependencies.outbox.staffPassStatus(actor, seatId, attemptId);
}
