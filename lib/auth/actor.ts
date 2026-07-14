import "server-only";

import type {Actor} from "@/lib/membership/lifecycle";
import * as authServer from "@/lib/auth/server";
import type {NeonSession} from "@/lib/auth/server";

type SessionLike = Pick<NeonSession, "user"> | {user?: {id?: string | null}};

/** Convert an authenticated Neon Auth session into the actor used by services. */
export function sessionToActor(session: SessionLike | null | undefined): Actor | null {
  const userId = session?.user?.id;
  return typeof userId === "string" && userId.length > 0 ? {kind: "member", userId} : null;
}

export async function getActor(): Promise<Actor | null> {
  return sessionToActor(await authServer.getSession());
}

export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) throw new Error("UNAUTHORIZED");
  return actor;
}

export function systemActor(source: "stripe-webhook"): Actor {
  return {kind: "system", userId: null, source};
}
