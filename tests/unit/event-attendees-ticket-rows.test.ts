import {describe, expect, it, vi} from "vitest";

import {listEventAttendees} from "@/lib/db/repos/events";

const staff = {kind: "staff" as const, userId: "auth-1", profileId: "p-1"};

function database(rows: readonly unknown[]) {
  return {
    execute: vi.fn(async (query: unknown) => {
      const text = String(query);
      // The first read is the existence probe; everything after it is the union.
      return text.includes("FROM \"events\"") && !text.includes("UNION")
        ? {rows: [{id: "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d"}]}
        : {rows};
    }),
  };
}

describe("the door list", () => {
  it("carries ticket seats alongside members and guests, keyed by seat", async () => {
    const rows = await listEventAttendees(staff, "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d", {
      loadDatabase: async () => database([{
        kind: "ticket", profile_id: null, guest_id: null, seat_id: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f",
        order_id: "b1a2c3d4-1111-4222-8333-944455566677", display_name: "Ada Lovelace", email: "ada@example.test",
        organisation: null, status: "paid", checked_in_at: null,
      }]) as never,
    });
    expect(rows).toEqual([{kind: "ticket", profileId: null, guestId: null, seatId: "3f1c9d5e-6a2b-4c8d-9e0f-1a2b3c4d5e6f", orderId: "b1a2c3d4-1111-4222-8333-944455566677", displayName: "Ada Lovelace", email: "ada@example.test", organisation: null, status: "paid", checkedInAt: null}]);
  });

  it("still validates the member and guest arms after the union widens", async () => {
    await expect(listEventAttendees(staff, "8b7a6c5d-4e3f-2a1b-9c8d-7e6f5a4b3c2d", {
      loadDatabase: async () => database([{kind: "nonsense", profile_id: null, guest_id: null, seat_id: null, order_id: null, display_name: "x", email: null, organisation: null, status: "paid", checked_in_at: null}]) as never,
    })).rejects.toThrow();
  });
});
