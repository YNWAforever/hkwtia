"use server";

import {headers} from "next/headers";

import {contactsRepository} from "@/lib/db/repos/contacts";
import {createInterestService, type InterestResult} from "@/lib/growth/interest-service";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {clientIpFromHeaders} from "@/lib/security/request-origin";

// Process-local, mirroring lib/showcase/lead-request-action.ts.
const interestRateLimiter = createInMemoryRateLimiter({limit: 3, windowMs: 15 * 60_000});

/** Only the formData wrapper is exported; it accepts nothing actor-shaped from the caller. */
export async function submitInterestAction(formData: FormData): Promise<InterestResult> {
  const service = createInterestService({
    contacts: contactsRepository,
    limiter: interestRateLimiter,
    resolveClientIp: async () => clientIpFromHeaders(await headers()),
  });
  return service.submit(formData);
}
