"use client";

import {useActionState, useState} from "react";

// Type-only: the action itself arrives as a prop, bound by the page.
import type {RefundOrderState} from "@/lib/tickets/refund-actions";
import type {EventOrderRow} from "@/lib/db/repos/event-orders";

export type OrdersLabels = Readonly<{
  caption: string; empty: string; buyer: string; seats: string; amount: string; status: string; refundedOn: string;
  refund: string; recheckRefund: string; confirm: string; cancel: string; note: string; statuses: Readonly<Record<string, string>>;
}>;

const initial: RefundOrderState = {status: "idle"};

/**
 * The staff member's own locale, so a zh-HK page does not show an `en-HK` amount
 * or date. HKD groups identically in both, but the date does not.
 */
function amountLabel(cents: number, locale: string): string {
  return new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}).format(cents / 100);
}

/**
 * `action` is the page's bound server action, so the table never has to know the
 * revalidation path. It is already a Server Function reference, which is what a
 * client component may hold; a locally-defined closure would not be.
 */
export function OrdersTable({action, rows, labels, locale}: Readonly<{action: (state: RefundOrderState, formData: FormData) => Promise<RefundOrderState>; rows: readonly EventOrderRow[]; labels: OrdersLabels; locale: string}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  // Hong Kong time, never a UTC slice: a refund made early in the HK morning
  // would otherwise render yesterday's date.
  const refundedOn = new Intl.DateTimeFormat(locale, {dateStyle: "medium", timeZone: "Asia/Hong_Kong"});
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <caption className="sr-only">{labels.caption}</caption>
        <thead><tr>
          <th scope="col">{labels.buyer}</th><th scope="col">{labels.seats}</th>
          <th scope="col">{labels.amount}</th><th scope="col">{labels.status}</th><th scope="col"/>
        </tr></thead>
        <tbody>
          {rows.map(({order, seatCount, seatNames}) => {
            // The row's seat cell and the confirmation must name the same seats, so
            // the summarising `+N` is part of the one string both render.
            const seatsText = seatNames.join(", ") + (seatCount > seatNames.length ? ` +${seatCount - seatNames.length}` : "");
            return (
            <tr key={order.id}>
              <td>{order.buyerName}</td>
              <td>{seatsText}</td>
              <td>{amountLabel(order.amountHkdCents, locale)}</td>
              <td>{labels.statuses[order.status] ?? order.status}</td>
              <td>
                {order.status === "refunded" ? (
                  <span className="text-muted-foreground">{labels.refundedOn} {order.refundedAt ? refundedOn.format(order.refundedAt) : ""}</span>
                ) : order.status === "refund_failed" ? (
                  <form action={dispatch}>
                    <input name="orderId" type="hidden" value={order.id}/>
                    <button className="min-h-11 rounded-md border px-4" disabled={pending} type="submit">{labels.recheckRefund}</button>
                  </form>
                ) : order.status === "paid" ? (
                  confirming === order.id ? (
                    <form action={dispatch} className="space-y-2">
                      <input name="orderId" type="hidden" value={order.id}/>
                      {/* Function replacements: a name containing `$&` or `$'` is inserted literally. */}
                      <p role="status">{labels.confirm
                        .replace("{buyer}", () => order.buyerName)
                        .replace("{seats}", () => seatsText)
                        .replace("{amount}", () => amountLabel(order.amountHkdCents, locale))}</p>
                      <label>{labels.note}<input className="ml-2 rounded-md border p-1" name="note" type="text"/></label>
                      <button className="min-h-11 rounded-md bg-destructive px-4 text-destructive-foreground" disabled={pending} type="submit">{labels.refund}</button>
                      <button className="ml-2 min-h-11 rounded-md border px-4" onClick={() => setConfirming(null)} type="button">{labels.cancel}</button>
                    </form>
                  ) : (
                    <button className="min-h-11 rounded-md border px-4" onClick={() => setConfirming(order.id)} type="button">{labels.refund}</button>
                  )
                ) : null}
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {state.status !== "idle" ? <p className="mt-3 text-sm" role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
    </div>
  );
}
