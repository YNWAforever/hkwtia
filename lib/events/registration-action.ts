"use server";

import {requireActor} from "@/lib/auth/actor";
import {eventsRepository} from "@/lib/db/repos/events";
import {
  mapEventRegistrationError,
  mapEventRegistrationResult,
  type RegistrationActionMessages,
  type RegistrationActionState,
  type RegistrationDisposition,
} from "@/lib/events/registration-state";
import type {Actor} from "@/lib/membership/lifecycle";

type RegistrationDependencies = Readonly<{
  requireActor: () => Promise<Actor>;
  register: (actor: Actor, input: Readonly<{eventId: FormDataEntryValue | null}>) => Promise<Readonly<{disposition: RegistrationDisposition}>>;
}>;

const defaultDependencies: RegistrationDependencies = {
  requireActor,
  register: eventsRepository.register,
};

export async function runPublicEventRegistrationAction(
  _state: RegistrationActionState,
  formData: FormData,
  options: Readonly<{messages: RegistrationActionMessages}> & Partial<RegistrationDependencies>,
): Promise<RegistrationActionState> {
  const dependencies: RegistrationDependencies = {...defaultDependencies, ...options};
  try {
    const actor = await dependencies.requireActor();
    const {disposition} = await dependencies.register(actor, {eventId: formData.get("eventId")});
    return mapEventRegistrationResult(disposition, options.messages);
  } catch (error) {
    return mapEventRegistrationError(error, options.messages);
  }
}
