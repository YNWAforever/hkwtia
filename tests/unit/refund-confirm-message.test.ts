import {describe, expect, it} from "vitest";

import {toRefundConfirmMessage} from "@/lib/admin/refund-confirm-message";

describe("toRefundConfirmMessage", () => {
  it("passes through a template carrying all three placeholders", () => {
    const value = "Refund {buyer}'s seats ({seats}) for {amount}?";

    expect(toRefundConfirmMessage(value)).toBe(value);
  });

  it.each([
    ["a non-string", 42],
    ["undefined", undefined],
    ["a template missing the buyer", "Refund the seats ({seats}) for {amount}?"],
    ["a template missing the seats", "Refund {buyer} for {amount}?"],
    ["a template missing the amount", "Refund {buyer}'s seats ({seats})?"],
  ])("falls back to a full template for %s", (_label, value) => {
    const message = toRefundConfirmMessage(value);

    expect(message).toContain("{buyer}");
    expect(message).toContain("{seats}");
    expect(message).toContain("{amount}");
  });

  // The fallback is language-neutral on purpose: a broken `confirm` on a zh-HK
  // page must not render an English sentence.
  it("falls back to a language-neutral placeholder set, not an English sentence", () => {
    const message = toRefundConfirmMessage(undefined);

    expect(message).toBe("{buyer} · {seats} · {amount}");
    // Nothing but separators remains once the placeholders are removed, so the
    // fallback carries no English words of its own.
    expect(message.replaceAll(/\{(?:buyer|seats|amount)\}/g, "")).toMatch(/^[\p{P}\p{S}\s]*$/u);
  });
});
