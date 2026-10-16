import {randomUUID} from "node:crypto";

import type {LoginDestination, LoginIntent} from "@/lib/auth/login-destination";

export type LoginResolution =
  | {kind: "signed-out"}
  | {kind: "needs-profile"; intent: LoginIntent}
  | {kind: "allowed"; destination: LoginDestination}
  | {kind: "forbidden"}
  | {kind: "unavailable"; reference: string};

export type LoginResolutionDependencies = Readonly<{
  session: () => Promise<{user?: {id?: string | null}} | null>;
  resolveProfile: (authUserId: string) => Promise<{role: "member" | "staff" | "exco" | "superadmin"} | null>;
}>;

export async function resolveLogin(
  destination: LoginDestination,
  dependencies: LoginResolutionDependencies,
): Promise<LoginResolution> {
  try {
    const session = await dependencies.session();
    const subject = session?.user?.id;
    if (typeof subject !== "string" || subject.length === 0) return {kind: "signed-out"};
    const profile = await dependencies.resolveProfile(subject);
    if (!profile) return {kind: "needs-profile", intent: destination.intent};
    if (destination.intent === "admin") {
      return profile.role === "staff" || profile.role === "exco" || profile.role === "superadmin"
        ? {kind: "allowed", destination}
        : {kind: "forbidden"};
    }
    return profile.role === "member" ? {kind: "allowed", destination} : {kind: "forbidden"};
  } catch {
    const reference = randomUUID();
    console.error(JSON.stringify({event: "login_resolution_unavailable", reference, occurredAt: new Date().toISOString()}));
    return {kind: "unavailable", reference};
  }
}
