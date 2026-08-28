"use server";

import {requireActor} from "@/lib/auth/actor";
import {eventsRepository} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";

export type RegistrationActionState = Readonly<{
  code?: "registered" | "waitlist" | "already_registered" | "already_waitlisted" | "unauthenticated" | "ineligible" | "closed" | "error";
  message?: string;
}>;

export type RegistrationActionMessages = Readonly<{
  registered: string;
  waitlist: string;
  alreadyRegistered: string;
  alreadyWaitlisted: string;
  unauthenticated: string;
  ineligible: string;
  closed: string;
  error: string;
}>;

type RegistrationDisposition = "registered" | "waitlist" | "already_registered" | "already_waitlisted";
type RegistrationDependencies = Readonly<{
  requireActor: () => Promise<Actor>;
  register: (actor: Actor, input: Readonly<{eventId: FormDataEntryValue | null}>) => Promise<Readonly<{disposition: RegistrationDisposition}>>;
}>;

const defaultDependencies: RegistrationDependencies = {
  requireActor,
  register: eventsRepository.register,
};

export function mapEventRegistrationResult(result: RegistrationDisposition, messages: RegistrationActionMessages): RegistrationActionState {
  switch (result) {
    case "registered": return {code: "registered", message: messages.registered};
    case "waitlist": return {code: "waitlist", message: messages.waitlist};
    case "already_registered": return {code: "already_registered", message: messages.alreadyRegistered};
    case "already_waitlisted": return {code: "already_waitlisted", message: messages.alreadyWaitlisted};
  }
}

export function mapEventRegistrationError(error: unknown, messages: RegistrationActionMessages): RegistrationActionState {
  const code = error instanceof Error ? error.message : "";
  if (code === "UNAUTHORIZED") return {code: "unauthenticated", message: messages.unauthenticated};
  if (code === "MEMBERSHIP_INACTIVE") return {code: "ineligible", message: messages.ineligible};
  if (code === "EVENT_REGISTRATION_CLOSED") return {code: "closed", message: messages.closed};
  return {code: "error", message: messages.error};
}

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
