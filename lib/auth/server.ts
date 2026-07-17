import "server-only";

import {randomBytes} from "node:crypto";

import {createNeonAuth} from "@neondatabase/auth/next/server";

import {parseServerEnv, publicEnv, serverEnv} from "@/lib/config/env";

// Next evaluates route modules in a production-like build worker. Keep that
// static analysis importable without credentials; the running production
// server still goes through serverEnv() and remains strict.
const environment =
  process.env.NEXT_PHASE === "phase-production-build"
    ? parseServerEnv({...process.env, NODE_ENV: "development"})
    : serverEnv();

// Non-production imports remain usable without checked-in credentials. The generated
// cookie secret resets local sessions when the process restarts; production is
// still required to provide both values by serverEnv().
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

/** Read the current Neon Auth session from the request cookies. */
export async function getSession(): Promise<NeonSession | null> {
  try {
    const result = await auth.getSession({query: {disableCookieCache: "true", disableRefresh: "true"}});
    return result.data ?? null;
  } catch (error) {
    // Server Components cannot mint Neon Auth cookies; treat that refresh path as signed out.
    if (error instanceof Error && error.message.includes("Cookies can only be modified")) return null;
    throw error;
  }
}
