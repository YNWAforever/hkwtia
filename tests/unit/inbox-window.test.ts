import {describe, expect, it} from "vitest";

import {
  CUSTOMER_SERVICE_WINDOW_MS,
  formatReplyWindow,
  replyWindow,
} from "@/lib/admin/inbox-action-core";
import {CUSTOMER_SERVICE_WINDOW_MS as ADAPTER_WINDOW_MS} from "@/lib/channels/woztell";

/**
 * C1 Task 8 Step 1. The composer's countdown and the adapter's own refusal are
 * two enforcement points over one rule, so the only interesting property is that
 * they cannot drift: a retyped `24 * 60 * 60 * 1_000` here is how a countdown
 * comes to promise a window `sendSessionMessage` then refuses, and staff read
 * that as "the reply button is broken".
 */
describe("replyWindow", () => {
  const lastInbound = new Date("2026-09-10T00:00:00.000Z");

  it("measures against the same constant the adapter enforces", () => {
    expect(CUSTOMER_SERVICE_WINDOW_MS).toBe(ADAPTER_WINDOW_MS);
  });

  it("is open with the remaining milliseconds while inside the window", () => {
    const now = new Date(lastInbound.getTime() + 3 * 60 * 60 * 1_000);
    expect(replyWindow(lastInbound, now)).toEqual({
      state: "open",
      remainingMs: CUSTOMER_SERVICE_WINDOW_MS - 3 * 60 * 60 * 1_000,
    });
  });

  it("is still open on the last millisecond, exactly as the adapter is", () => {
    // `sendSessionMessage` refuses on `elapsed > WINDOW`, so `elapsed === WINDOW`
    // must be open here too or the countdown closes a window the adapter would
    // still have accepted.
    const now = new Date(lastInbound.getTime() + CUSTOMER_SERVICE_WINDOW_MS);
    expect(replyWindow(lastInbound, now)).toEqual({state: "open", remainingMs: 0});
    const after = new Date(lastInbound.getTime() + CUSTOMER_SERVICE_WINDOW_MS + 1);
    expect(replyWindow(lastInbound, after)).toEqual({state: "closed", remainingMs: 0});
  });

  it("reads a missing last inbound as `never`, not as `open`", () => {
    // A thread nobody has written into has no window at all. Reading NULL as an
    // open window would offer staff a free-text reply WhatsApp will refuse, and
    // every pre-deploy anonymous thread is in exactly this state until its next
    // inbound message (the plan's own owner-action note).
    expect(replyWindow(null, lastInbound)).toEqual({state: "never", remainingMs: 0});
    expect(replyWindow(new Date(Number.NaN), lastInbound)).toEqual({state: "never", remainingMs: 0});
  });
});

/**
 * The countdown is formatted on the server, from the same result, so the client
 * component holds no clock of its own — a `setInterval` in the composer would
 * tick a number the send gate never consults and cannot enforce. It lives beside
 * `replyWindow` rather than in a module of its own because both are arithmetic
 * over the one constant, and splitting them is how the two come to disagree.
 */
describe("formatReplyWindow", () => {
  it("splits the remaining milliseconds into whole hours and minutes", () => {
    expect(formatReplyWindow({state: "open", remainingMs: (3 * 60 + 20) * 60 * 1_000}))
      .toEqual({hours: "3", minutes: "20"});
  });

  it("floors rather than rounds, so it never promises a minute that has gone", () => {
    expect(formatReplyWindow({state: "open", remainingMs: 59 * 1_000}))
      .toEqual({hours: "0", minutes: "0"});
  });

  it("is zero for a closed or absent window", () => {
    expect(formatReplyWindow({state: "closed", remainingMs: 0})).toEqual({hours: "0", minutes: "0"});
    expect(formatReplyWindow({state: "never", remainingMs: 0})).toEqual({hours: "0", minutes: "0"});
  });
});
