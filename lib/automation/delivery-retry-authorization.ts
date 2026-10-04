import type {DeliveryFailureCode} from "@/lib/email/transport";

export const ADMIN_RETRY_AUTHORIZATION_BY_FAILURE = {
  retryable_network: "admin_retry_retryable_network",
  retryable_rate_limit: "admin_retry_retryable_rate_limit",
  retryable_server: "admin_retry_retryable_server",
  provider_client_error: "admin_retry_provider_client_error",
  provider_unclassified_failure:
    "admin_retry_provider_unclassified_failure",
} as const satisfies Record<DeliveryFailureCode, string>;

export type AdminRetryAuthorizationCode =
  typeof ADMIN_RETRY_AUTHORIZATION_BY_FAILURE[DeliveryFailureCode];

const failureByAuthorization = new Map<AdminRetryAuthorizationCode, DeliveryFailureCode>(
  Object.entries(ADMIN_RETRY_AUTHORIZATION_BY_FAILURE).map(
    ([failureCode, authorizationCode]) => [
      authorizationCode,
      failureCode as DeliveryFailureCode,
    ],
  ),
);

const providerFailureCodes = new Set<DeliveryFailureCode>(
  Object.keys(ADMIN_RETRY_AUTHORIZATION_BY_FAILURE) as DeliveryFailureCode[],
);

export function providerFailureCode(
  value: string | null | undefined,
): DeliveryFailureCode | null {
  return value && providerFailureCodes.has(value as DeliveryFailureCode)
    ? value as DeliveryFailureCode
    : null;
}

export function authorizedProviderFailureCode(
  value: string | null | undefined,
): DeliveryFailureCode | null {
  return value
    ? failureByAuthorization.get(value as AdminRetryAuthorizationCode) ?? null
    : null;
}

/** A timeout, 5xx, or malformed acceptance may have caused an external effect. */
export function providerEffectIsUncertain(code: string | null | undefined): boolean {
  return code === "provider_acceptance_uncertain" || code === "delivery_unknown" || code === "retryable_network"
    || code === "retryable_server" || code === "provider_unclassified_failure";
}

export type DeliveryEffectFailureCode = DeliveryFailureCode | "provider_acceptance_uncertain";
export function providerEffectFailureCode(code: DeliveryEffectFailureCode): DeliveryEffectFailureCode {
  return providerEffectIsUncertain(code) ? "provider_acceptance_uncertain" : code;
}
