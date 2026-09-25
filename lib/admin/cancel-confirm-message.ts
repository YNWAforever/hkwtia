/**
 * `CancelPanelLabels.confirm` (components/admin/cancel-event-panel.tsx) is interpolated
 * with manual `.replace("{orders}", …)` / `.replace("{amount}", …)` / `.replace("{attendees}", …)` /
 * `.replace("{registrants}", …)` inside the panel, not by next-intl -- so
 * `Admin.eventsMgmt.cancel.confirm` must be read with `t.raw`, not `t`. `t` parses ICU
 * MessageFormat, and a literal `{orders}` looks exactly like an ICU argument nobody ever passed
 * `values.orders` to; next-intl's development build throws a `FORMATTING_ERROR` for it and falls
 * back to the bare message key, the trap `lib/admin/refund-confirm-message.ts` records for the same
 * shape.
 *
 * This lives outside a "use client" module because the events-mgmt page that builds this label is a
 * Server Component; importing a function from a client module would fail at request time.
 */
// Language-neutral on purpose: this is what a broken `confirm` renders, and an
// English sentence would be shown verbatim on a zh-HK page.
export const FALLBACK_CANCEL_CONFIRM_MESSAGE = "{orders} · {amount} · {attendees} · {registrants}";

/** Guards the one contract `confirm` has with CancelEventPanel: all four placeholders present. */
export function toCancelConfirmMessage(value: unknown): string {
  return typeof value === "string"
    && value.includes("{orders}")
    && value.includes("{amount}")
    && value.includes("{attendees}")
    && value.includes("{registrants}")
    ? value
    : FALLBACK_CANCEL_CONFIRM_MESSAGE;
}
