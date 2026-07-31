import {describe, expect, it} from "vitest";

import {createWoztellAdapter} from "@/lib/channels/woztell";

const EPOCH_MS = 1753664400000;
const EPOCH_SECONDS = 1753664400;

function payload(timestamp: unknown) {
  return {
    from: "85290000000",
    type: "TEXT",
    messageId: "wamid.numeric-time",
    timestamp,
    data: {text: "Hello"},
  };
}

describe("WOZTELL numeric timestamp normalization", () => {
  it.each([
    ["epoch milliseconds", EPOCH_MS],
    ["epoch seconds", EPOCH_SECONDS],
    ["ISO string", new Date(EPOCH_MS).toISOString()],
  ])("accepts documented %s", (_name, timestamp) => {
    expect(createWoztellAdapter({}).normalizeInbound(payload(timestamp)))
      .toMatchObject({
        kind: "message",
        providerMessageId: "wamid.numeric-time",
        receivedAt: new Date(EPOCH_MS),
      });
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    -1,
    0,
    9999999999999999,
    "not-a-date",
  ])("rejects invalid or out-of-range timestamp %s", (timestamp) => {
    expect(createWoztellAdapter({}).normalizeInbound(payload(timestamp)))
      .toEqual({
        kind: "unsupported",
        sender: "85290000000",
        text: null,
        intent: null,
      });
  });
});
