/**
 * `OrdersLabels.confirm` (components/admin/orders-table.tsx) is interpolated with manual
 * `.replace("{buyer}", …)` / `.replace("{seats}", …)` / `.replace("{amount}", …)` inside the table,
 * not by next-intl -- so `Admin.eventsMgmt.orders.confirm` must be read with `t.raw`, not `t`.
 * `t` parses ICU MessageFormat, and a literal `{buyer}` looks exactly like an ICU argument nobody
 * ever passed `values.buyer` to; next-intl's development build throws a `FORMATTING_ERROR` for it
 * and falls back to the bare message key, which is the trap `lib/admin/archive-toggle-labels.ts`
 * records for the same shape.
 *
 * This lives outside a "use client" module because the events-mgmt page that builds this label is a
 * Server Component; importing a function from a client module would fail at request time.
 */
export const FALLBACK_REFUND_CONFIRM_MESSAGE = "Refund {buyer}'s seats ({seats}) for {amount}?";

/** Guards the one contract `confirm` has with OrdersTable: all three placeholders present. */
export function toRefundConfirmMessage(value: unknown): string {
  return typeof value === "string"
    && value.includes("{buyer}")
    && value.includes("{seats}")
    && value.includes("{amount}")
    ? value
    : FALLBACK_REFUND_CONFIRM_MESSAGE;
}
