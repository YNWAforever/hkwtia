"use server";

import {headers} from "next/headers";

import {serverEnv} from "@/lib/config/env";
import {showcaseRepository} from "@/lib/db/repos/showcase";
import {renderEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport} from "@/lib/email/transport";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";
import {createLeadService, type LeadRequestResult} from "@/lib/showcase/lead-actions";

// Process-local, mirroring the concierge route. Kept at module scope so the
// quota survives across requests handled by the same server instance.
const leadRateLimiter = createInMemoryRateLimiter({limit: 3, windowMs: 15 * 60_000});

/**
 * The Server Action boundary for the public "request intro" form. This lives in
 * its own `"use server"` module because `lib/showcase/lead-actions.ts` is
 * `server-only` and exports non-action values, which a `"use server"` module
 * may not do.
 */
export async function requestIntroAction(
  formData: FormData,
): Promise<LeadRequestResult> {
  const environment = serverEnv();
  const service = createLeadService({
    repository: showcaseRepository,
    limiter: leadRateLimiter,
    emailTransport: createConfiguredEmailTransport(environment),
    renderEmail,
    resolveStaffRecipient: async () =>
      process.env.SHOWCASE_STAFF_EMAIL?.trim() || environment.emailFrom.trim() || null,
    resolveClientIp: async () => clientIpFromHeaders(await headers()),
    emailFrom: environment.emailFrom,
    appUrl: environment.appUrl || "http://localhost:3000",
  });
  return service.request(formData);
}
