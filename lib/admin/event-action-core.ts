import {z} from "zod";

import {isAuthorizationDenial} from "@/lib/auth/authorization-denial";
// Type-only: erased at compile time, so this plain module stays importable from
// the client without dragging the server-only repository in.
import type {CancelEventOutcome} from "@/lib/db/repos/events";

export type EventActionState = Readonly<{
  status?: "success" | "error";
  message?: string;
  fieldErrors?: Readonly<Record<string, string>>;
  values?: Readonly<Record<string, string>>;
}>;

type EventFormOptions = Readonly<{
  successMessage: string;
  validationMessage: string;
  errorMessage: string;
  mutate: (formData: FormData) => Promise<unknown>;
}>;
type SimpleOptions = Readonly<{successMessage: string; errorMessage: string; mutate: (formData: FormData) => Promise<unknown>}>;
const preservedFields = ["slug", "titleEn", "titleZh", "descriptionEn", "descriptionZh", "startsAt", "endsAt", "venue", "capacity", "registrationMode", "ticketPriceHkdCents", "memberOnly", "published", "heroMediaId"] as const;

export async function runEventFormAction(_state: EventActionState, formData: FormData, options: EventFormOptions): Promise<EventActionState> {
  const values = Object.fromEntries(preservedFields.map((name) => [name, String(formData.get(name) ?? "")]));
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    if (error instanceof z.ZodError) {
      const fieldErrors = Object.fromEntries(error.issues.flatMap((issue) => typeof issue.path[0] === "string" ? [[issue.path[0], options.validationMessage]] : []));
      return {status: "error", message: options.validationMessage, fieldErrors, values};
    }
    return {status: "error", message: options.errorMessage, values};
  }
}

export async function runCheckInAction(_state: EventActionState, formData: FormData, options: SimpleOptions): Promise<EventActionState> {
  try {
    await options.mutate(formData);
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.errorMessage};
  }
}

/**
 * The seat outcomes each carry their own wording. The messages are supplied by
 * the caller (localized in the page) rather than hardcoded here, so every
 * branch a seat can land on has a distinct string and none of them can be
 * mistaken for another.
 */
export type SeatCheckInMessages = Readonly<{
  successMessage: string;
  successMessageAlready: string;
  successMessageUndone: string;
  notCheckedInMessage: string;
  notAdmissibleMessage: string;
  errorMessage: string;
}>;

type SeatCheckInOptions = SeatCheckInMessages & Readonly<{mutate: (formData: FormData) => Promise<unknown>}>;

/**
 * The seat check-in outcome is a string the repository decides under the row
 * lock, so the core maps it to a message rather than guessing from the form.
 * `already_checked_in`, `undone` and `not_checked_in` are successes: a double
 * scan, a deliberate reversal and an undo of an already-clear seat all asked
 * for a state the seat is now in. Each still gets its own message — an undo
 * that says "Checked in." would describe the opposite of what happened.
 */
export async function runSeatCheckInAction(_state: EventActionState, formData: FormData, options: SeatCheckInOptions): Promise<EventActionState> {
  try {
    const outcome = await options.mutate(formData);
    if (outcome === "already_checked_in") return {status: "success", message: options.successMessageAlready};
    if (outcome === "undone") return {status: "success", message: options.successMessageUndone};
    if (outcome === "not_checked_in") return {status: "success", message: options.notCheckedInMessage};
    if (outcome === "not_admissible") return {status: "error", message: options.notAdmissibleMessage};
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.errorMessage};
  }
}

/**
 * The four outcomes a cancellation can land on, each with its own wording, so a
 * staff member is never told "cancelled" for a write that refused. The messages
 * are supplied by the caller (localized in the page) rather than hardcoded here,
 * because this is a `.ts` module the visible-string audit does not scan.
 */
export type CancelEventMessages = Readonly<{
  successMessage: string;
  alreadyCancelledMessage: string;
  invalidTransitionMessage: string;
  notFoundMessage: string;
  errorMessage: string;
}>;

type CancelEventOptions = CancelEventMessages & Readonly<{mutate: (formData: FormData) => Promise<CancelEventOutcome>}>;

export async function runCancelEventAction(_state: EventActionState, formData: FormData, options: CancelEventOptions): Promise<EventActionState> {
  try {
    const outcome = await options.mutate(formData);
    if (outcome.status === "already_cancelled") return {status: "error", message: options.alreadyCancelledMessage};
    if (outcome.status === "invalid_transition") return {status: "error", message: options.invalidTransitionMessage};
    if (outcome.status === "not_found") return {status: "error", message: options.notFoundMessage};
    return {status: "success", message: options.successMessage};
  } catch (error) {
    if (isAuthorizationDenial(error)) throw error;
    return {status: "error", message: options.errorMessage};
  }
}
