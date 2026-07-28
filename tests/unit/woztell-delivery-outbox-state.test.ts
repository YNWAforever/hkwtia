import {describe, expect, it} from "vitest";

import {
  decideWoztellDeliveryReservation,
} from "@/lib/db/repos/woztell-delivery-outbox";

describe("WOZTELL delivery outbox state", () => {
  it("sends only a new or explicitly retryable stable reservation", () => {
    expect(decideWoztellDeliveryReservation(null))
      .toEqual({status: "send"});
    expect(decideWoztellDeliveryReservation({
      state: "retryable",
      providerId: null,
    })).toEqual({status: "send"});
  });

  it("never blindly replays a previously reserved ambiguous delivery", () => {
    expect(decideWoztellDeliveryReservation({
      state: "reserved",
      providerId: null,
    })).toEqual({status: "uncertain"});
    expect(decideWoztellDeliveryReservation({
      state: "uncertain",
      providerId: null,
    })).toEqual({status: "uncertain"});
  });

  it("reuses a durably accepted provider result without another send", () => {
    expect(decideWoztellDeliveryReservation({
      state: "accepted",
      providerId: "wamid.accepted",
    })).toEqual({status: "sent", providerId: "wamid.accepted"});
  });

  it.each(["blocked", "skipped"] as const)(
    "preserves terminal non-send state %s",
    (state) => {
      expect(decideWoztellDeliveryReservation({
        state,
        providerId: null,
      })).toEqual({status: state});
    },
  );
});
