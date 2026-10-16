import {describe, expect, it} from "vitest";

import {seatInvitationErrorKey} from "@/lib/portal/seat-invitation-errors";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

describe("seatInvitationErrorKey", () => {
  it.each([
    ["INVITATION_NOT_FOUND", "invitationNotFound"],
    ["INVITATION_REVOKED", "invitationRevoked"],
    ["INVITATION_ALREADY_ACCEPTED", "invitationAlreadyAccepted"],
    ["INVITATION_EXPIRED", "invitationExpired"],
    ["INVITATION_EMAIL_MISMATCH", "invitationEmailMismatch"],
    ["MEMBERSHIP_EXISTS", "membershipExists"],
    ["SEAT_LIMIT_REACHED", "seatLimitReached"],
  ])("maps %s to Portal.seats.errors.%s", (code, key) => {
    expect(seatInvitationErrorKey(code)).toBe(key);
  });

  it("falls back to generic for a code acceptSeatInvitation cannot actually throw", () => {
    expect(seatInvitationErrorKey("INVALID_EMAIL")).toBe("generic");
    expect(seatInvitationErrorKey("UNKNOWN_FUTURE_CODE")).toBe("generic");
  });

  it("resolves every mapped key to a real, distinct string in both message bundles", () => {
    const codes = [
      "INVITATION_NOT_FOUND", "INVITATION_REVOKED", "INVITATION_ALREADY_ACCEPTED",
      "INVITATION_EXPIRED", "INVITATION_EMAIL_MISMATCH", "MEMBERSHIP_EXISTS", "SEAT_LIMIT_REACHED",
    ];
    const seen = new Set<string>();
    for (const code of codes) {
      const key = seatInvitationErrorKey(code);
      const enMessage = (en.Portal.seats.errors as Record<string, string>)[key];
      const zhMessage = (zh.Portal.seats.errors as Record<string, string>)[key];
      expect(enMessage, `en Portal.seats.errors.${key}`).toBeTypeOf("string");
      expect(zhMessage, `zh Portal.seats.errors.${key}`).toBeTypeOf("string");
      expect(enMessage).not.toBe(en.Portal.seats.errors.generic);
      expect(seen.has(enMessage)).toBe(false);
      seen.add(enMessage);
    }
  });
});
