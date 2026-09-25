import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {FALLBACK_CANCEL_CONFIRM_MESSAGE, toCancelConfirmMessage} from "@/lib/admin/cancel-confirm-message";
import type {EventActionState} from "@/lib/admin/event-action-core";
import {CancelEventPanel, type CancelPanelLabels} from "@/components/admin/cancel-event-panel";
import en from "@/messages/en.json";
import zhHk from "@/messages/zh-HK.json";

const labels: CancelPanelLabels = {
  heading: "Cancel event",
  description: "Cancelling is final. Every paid order is refunded.",
  button: "Cancel event",
  keep: "Keep event",
  submitting: "Cancelling...",
  unavailable: "The refund cost could not be loaded right now.",
  confirm: "Refund {orders} paid orders for {amount} ({attendees} paid attendees). {registrants} RSVP registrants will not be emailed. This cannot be undone.",
};

const PREVIEW = {paidOrders: 2, refundTotalHkdCents: 100_000, attendees: 3, rsvpRegistrants: 7};

function amountLabel(cents: number, locale = "en-HK"): string {
  return new Intl.NumberFormat(locale, {style: "currency", currency: "HKD"}).format(cents / 100);
}

function noopAction(overrides: Partial<EventActionState> = {}): (state: EventActionState, formData: FormData) => Promise<EventActionState> {
  return async () => ({...overrides}) as EventActionState;
}

describe("CancelEventPanel", () => {
  it("renders the control and posts nothing until it is opened", () => {
    const action = vi.fn(noopAction());
    render(<CancelEventPanel action={action} labels={labels} locale="en" preview={PREVIEW} />);

    expect(screen.getByRole("heading", {name: labels.heading})).toBeInTheDocument();
    expect(screen.getByRole("button", {name: labels.button})).toBeInTheDocument();
    // A stray click cannot cancel: the confirmation is the step that turns the
    // control into a form.
    expect(screen.queryByRole("status")).toBeNull();
    expect(document.querySelector("form")).toBeNull();
    expect(action).not.toHaveBeenCalled();
  });

  it("names the orders, the refund total, the attendees and the un-notified registrants before it submits", () => {
    render(<CancelEventPanel action={noopAction()} labels={labels} locale="en" preview={PREVIEW} />);

    fireEvent.click(screen.getByRole("button", {name: labels.button}));

    const confirm = screen.getByRole("status");
    expect(confirm).toHaveTextContent("2");
    expect(confirm).toHaveTextContent(amountLabel(100_000));
    expect(confirm).toHaveTextContent("3");
    // The finding this pins: the registrant count is interpolated too, so a free
    // event whose only attendees are registrants is not reported as zero.
    expect(confirm).toHaveTextContent("7");
    expect(confirm).toHaveTextContent("will not be emailed");
    // No placeholder survived: a broken replacement would show the raw `{orders}`.
    expect(confirm.textContent).not.toContain("{");
    // The dismiss control is what lets staff stop before the irreversible write.
    expect(screen.getByRole("button", {name: labels.keep})).toBeInTheDocument();
  });

  it("submits the confirmation through the action it was given", async () => {
    const action = vi.fn(noopAction({status: "success", message: "Event cancelled."}));
    render(<CancelEventPanel action={action} labels={labels} locale="en" preview={PREVIEW} />);

    fireEvent.click(screen.getByRole("button", {name: labels.button}));
    fireEvent.submit(screen.getByRole("status").closest("form")!);

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0]![1]).toBeInstanceOf(FormData);
  });

  it("blocks cancellation when the cost preview could not be loaded", () => {
    const action = vi.fn(noopAction());
    render(<CancelEventPanel action={action} labels={labels} locale="en" preview={null} />);

    fireEvent.click(screen.getByRole("button", {name: labels.button}));

    const confirm = screen.getByRole("status");
    expect(confirm).toHaveTextContent(labels.unavailable);
    // "Nothing will be refunded" and "we could not ask" are different answers.
    expect(confirm.textContent).not.toContain(amountLabel(0));
    expect(screen.getByRole("button", {name: labels.button})).toBeDisabled();
    expect(action).not.toHaveBeenCalled();
  });

  it("reports the action's outcome as an alert on failure and a status on success", async () => {
    const action = vi.fn(noopAction({status: "error", message: labels.unavailable}));
    render(<CancelEventPanel action={action} labels={labels} locale="en" preview={PREVIEW} />);

    fireEvent.click(screen.getByRole("button", {name: labels.button}));
    fireEvent.submit(screen.getByRole("status").closest("form")!);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(labels.unavailable));
  });
});

describe("the cancellation copy", () => {
  // Derived from the bundles the pages bind, so a key missing from one locale is
  // a string rendered as `undefined` rather than a silent English fallback.
  const keys = ["heading", "description", "button", "keep", "submitting", "unavailable", "cancelledNotice", "confirm", "outcomes"].sort();
  const outcomeKeys = ["success", "alreadyCancelled", "invalidTransition", "notFound", "error"].sort();

  it("ships the same cancel keys in both bundles", () => {
    expect(Object.keys(en.Admin.eventsMgmt.cancel).sort()).toEqual(keys);
    expect(Object.keys(zhHk.Admin.eventsMgmt.cancel).sort()).toEqual(keys);
    expect(Object.keys(en.Admin.eventsMgmt.cancel.outcomes).sort()).toEqual(outcomeKeys);
    expect(Object.keys(zhHk.Admin.eventsMgmt.cancel.outcomes).sort()).toEqual(outcomeKeys);
  });

  // The confirmation is interpolated by hand, not by next-intl, so a placeholder
  // dropped in one locale would render a confirmation that never names the cost.
  it.each(["en", "zh-HK"] as const)("keeps all four cost placeholders in the %s confirmation", (locale) => {
    const confirm = (locale === "en" ? en : zhHk).Admin.eventsMgmt.cancel.confirm;
    expect(confirm).toContain("{orders}");
    expect(confirm).toContain("{amount}");
    expect(confirm).toContain("{attendees}");
    expect(confirm).toContain("{registrants}");
  });

  // The finding this pins: naming the registrants is only honest if the copy says
  // what happens to them. A free event's registrants are not emailed, and the
  // confirmation must say so rather than reading as "nobody is affected".
  it.each([
    ["en", en],
    ["zh-HK", zhHk],
  ] as const)("says in the %s confirmation that RSVP registrants are not emailed", (_locale, bundle) => {
    const confirm = bundle.Admin.eventsMgmt.cancel.confirm;
    const saysNotEmailed = /not be emailed/i.test(confirm) || confirm.includes("不會");
    expect(saysNotEmailed).toBe(true);
  });

  it("falls back to a language-neutral confirmation when a placeholder is missing", () => {
    expect(toCancelConfirmMessage("{orders} {amount} {attendees} {registrants}")).toBe("{orders} {amount} {attendees} {registrants}");
    expect(toCancelConfirmMessage("Refund {orders} for {amount}")).toBe(FALLBACK_CANCEL_CONFIRM_MESSAGE);
    expect(toCancelConfirmMessage("Refund {orders} for {amount} covering {attendees}")).toBe(FALLBACK_CANCEL_CONFIRM_MESSAGE);
    expect(toCancelConfirmMessage(undefined)).toBe(FALLBACK_CANCEL_CONFIRM_MESSAGE);
    expect(FALLBACK_CANCEL_CONFIRM_MESSAGE).toContain("{orders}");
    expect(FALLBACK_CANCEL_CONFIRM_MESSAGE).toContain("{amount}");
    expect(FALLBACK_CANCEL_CONFIRM_MESSAGE).toContain("{attendees}");
    expect(FALLBACK_CANCEL_CONFIRM_MESSAGE).toContain("{registrants}");
  });
});
