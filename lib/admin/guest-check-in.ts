import "server-only";

import {requireAdmin} from "@/lib/auth/authorize";
import {eventGuestsRepository, type GuestCheckInDisposition} from "@/lib/db/repos/event-guests";
import type {Actor} from "@/lib/membership/lifecycle";

export type GuestCheckInInput = Readonly<{eventId: string; registrationId: string}>;

/** The actor is resolved by the public Server Action, never read from the form. */
export async function checkInGuest(actor: Actor, input: GuestCheckInInput, repository: Pick<typeof eventGuestsRepository, "checkInGuest"> = eventGuestsRepository): Promise<GuestCheckInDisposition> {
  requireAdmin(actor);
  return repository.checkInGuest(actor, input);
}
