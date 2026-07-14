import "server-only";

import {createNeonAuth} from "@neondatabase/auth/next/server";

import {serverEnv} from "@/lib/config/env";

const environment = serverEnv();

// Production is validated by serverEnv(). The development fallback keeps the
// module importable for local builds and deterministic unit tests without ever
// weakening the production requirement for an explicitly configured secret.
const baseUrl = environment.neonAuthBaseUrl || "http://localhost:3000";
const cookieSecret =
  environment.neonAuthCookieSecret || "local-development-neon-auth-cookie-secret-32-chars";

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
  const result = await auth.getSession();
  return result.data ?? null;
}
