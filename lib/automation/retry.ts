import type {RetryDecision} from "@/lib/automation/types";

const retryDelayMinutes = (attempt: number): 5 | 25 => attempt === 1 ? 5 : 25;

export const classifyDeliveryFailure = (status: number | null | undefined, attempt: number): RetryDecision => {
  if (attempt >= 3) return {action: "permanent", code: "attempts_exhausted"};

  if (status === null || status === undefined) {
    return {action: "retry", code: "retryable_network", delayMinutes: retryDelayMinutes(attempt)};
  }
  if (status === 429) {
    return {action: "retry", code: "retryable_rate_limit", delayMinutes: retryDelayMinutes(attempt)};
  }
  if (status >= 500 && status <= 599) {
    return {action: "retry", code: "retryable_server", delayMinutes: retryDelayMinutes(attempt)};
  }
  if (status >= 400 && status <= 499) return {action: "permanent", code: "provider_client_error"};

  return {action: "permanent", code: "provider_unclassified_failure"};
};
