import "server-only";

/**
 * Runs the contact -> `member` flip for an activated membership and swallows any failure. The
 * membership is already active (and, on the webhook path, already committed); a CRM stage that
 * could not move must never undo or delay that. The log line names the membership only.
 */
export async function flipContactOnActivation(flip: () => Promise<unknown>, membershipId: string): Promise<void> {
  try {
    await flip();
  } catch {
    console.error("contact.member_flip_failed", {membershipId});
  }
}
