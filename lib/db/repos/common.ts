import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";

export type Database = typeof import("@/lib/db/client").db;

export async function getDb(): Promise<Database> {
  return (await import("@/lib/db/client")).db;
}

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN";

  constructor(message = "FORBIDDEN") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function forbidden(): never {
  throw new AuthorizationError();
}

export function requireSystem(actor: Actor): asserts actor is Extract<Actor, {kind: "system"}> {
  if (actor.kind !== "system" || actor.source !== "stripe-webhook") forbidden();
}

export function requireMember(actor: Actor): asserts actor is Extract<Actor, {kind: "member"}> {
  if (actor.kind !== "member") forbidden();
}
