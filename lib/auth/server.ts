import "server-only";

import {randomBytes} from "node:crypto";

import {createNeonAuth} from "@neondatabase/auth/next/server";

import {authEnv, parseAuthEnv, publicEnv} from "@/lib/config/env";

// Next evaluates route modules in a production-like build worker. Keep that
// static analysis importable without credentials; the running production
// server still goes through authEnv() and remains strict.
const environment =
  process.env.NEXT_PHASE === "phase-production-build"
    ? parseAuthEnv({...process.env, NODE_ENV: "development"})
    : authEnv();

// Non-production imports remain usable without checked-in credentials. The generated
// cookie secret resets local sessions when the process restarts; production is
// still required to provide both values by authEnv().
const baseUrl = environment.neonAuthBaseUrl || publicEnv().siteUrl;
const cookieSecret = environment.neonAuthCookieSecret || randomBytes(32).toString("hex");

export const auth = createNeonAuth({
  baseUrl,
  cookies: {
    secret: cookieSecret,
    sessionDataTtl: 300,
  },
});

export type NeonSession = NonNullable<Awaited<ReturnType<typeof auth.getSession>>["data"]>;

const COOKIE_MUTATION_ERROR = "Cookies can only be modified in a Server Action or Route Handler.";
type SessionResult = Awaited<ReturnType<typeof auth.getSession>> & {error?: unknown};

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  try {
    return JSON.stringify(error) || String(error);
  } catch {
    return String(error);
  }
}

function normalizeError(error: unknown): Error {
  return error instanceof Error ? error : new Error(errorMessage(error));
}

function isCookieMutationError(error: unknown): boolean {
  const message = errorMessage(error);
  return message === COOKIE_MUTATION_ERROR || message.startsWith(`${COOKIE_MUTATION_ERROR} `) || message.startsWith(`${COOKIE_MUTATION_ERROR}\n`);
}

/** Read the current Neon Auth session from the request cookies. */
export async function getSession(): Promise<NeonSession | null> {
  try {
    const result = await auth.getSession({query: {disableCookieCache: "true", disableRefresh: "true"}}) as SessionResult;
    if (result.error != null) {
      if (isCookieMutationError(result.error)) return null;
      throw normalizeError(result.error);
    }
    return result.data ?? null;
  } catch (error) {
    // Server Components cannot mint Neon Auth cookies; treat that refresh path as signed out.
    if (isCookieMutationError(error)) return null;
    throw error;
  }
}
