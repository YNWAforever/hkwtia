"use client";

import {useActionState, useState} from "react";

// Type-only: the action itself arrives as a prop, bound by the page.
import type {RefundOrderState} from "@/lib/tickets/refund-actions";
import type {EventOrderRow} from "@/lib/db/repos/event-orders";

export type OrdersLabels = Readonly<{
  caption: string; buyer: string; seats: string; amount: string; status: string; refundedOn: string;
  refund: string; confirm: string; cancel: string; note: string; statuses: Readonly<Record<string, string>>;
}>;

const initial: RefundOrderState = {status: "idle"};

function amountLabel(cents: number): string {
  return new Intl.NumberFormat("en-HK", {style: "currency", currency: "HKD"}).format(cents / 100);
}

/**
 * `action` is the page's bound server action, so the table never has to know the
 * revalidation path. It is already a Server Function reference, which is what a
 * client component may hold; a locally-defined closure would not be.
 */
export function OrdersTable({action, rows, labels}: Readonly<{action: (state: RefundOrderState, formData: FormData) => Promise<RefundOrderState>; rows: readonly EventOrderRow[]; labels: OrdersLabels}>) {
  const [state, dispatch, pending] = useActionState(action, initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  if (rows.length === 0) return <p className="text-muted-foreground">{labels.caption}</p>;
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
              <td>{amountLabel(order.amountHkdCents)}</td>
              <td>{labels.statuses[order.status] ?? order.status}</td>
              <td>
                {order.status === "refunded" ? (
                  <span className="text-muted-foreground">{labels.refundedOn} {order.refundedAt?.toISOString().slice(0, 10)}</span>
                ) : order.status === "paid" ? (
                  confirming === order.id ? (
                    <form action={dispatch} className="space-y-2">
                      <input name="orderId" type="hidden" value={order.id}/>
                      {/* Function replacements: a name containing `$&` or `$'` is inserted literally. */}
                      <p role="status">{labels.confirm
                        .replace("{buyer}", () => order.buyerName)
                        .replace("{seats}", () => seatsText)
                        .replace("{amount}", () => amountLabel(order.amountHkdCents))}</p>
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
