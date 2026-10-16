/**
 * lib/db/repos/seats.ts's acceptSeatInvitation throws a SeatServiceError whose
 * `code` is one of a fixed, known set. Maps each reachable code to its
 * Portal.seats.errors.* message key; any other code (e.g. INVALID_EMAIL,
 * which acceptSeatInvitation cannot actually throw) falls back to "generic".
 */
const SEAT_INVITATION_ERROR_KEYS: Readonly<Record<string, string>> = {
  INVITATION_NOT_FOUND: "invitationNotFound",
  INVITATION_REVOKED: "invitationRevoked",
  INVITATION_ALREADY_ACCEPTED: "invitationAlreadyAccepted",
  INVITATION_EXPIRED: "invitationExpired",
  INVITATION_EMAIL_MISMATCH: "invitationEmailMismatch",
  MEMBERSHIP_EXISTS: "membershipExists",
  SEAT_LIMIT_REACHED: "seatLimitReached",
};

export function seatInvitationErrorKey(code: string): string {
  return SEAT_INVITATION_ERROR_KEYS[code] ?? "generic";
}
