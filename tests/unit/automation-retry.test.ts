import {describe, expect, it} from "vitest";

import {classifyDeliveryFailure} from "@/lib/automation/retry";

describe("classifyDeliveryFailure", () => {
  it.each([
    [undefined, 1, "retryable_network", 5],
    [429, 1, "retryable_rate_limit", 5],
    [503, 2, "retryable_server", 25],
  ] as const)("retries %s after attempt %s", (status, attempt, code, delayMinutes) => {
    expect(classifyDeliveryFailure(status, attempt)).toEqual({
      action: "retry",
      code,
      delayMinutes,
    });
  });

  it.each([400, 401, 403, 404, 422])("classifies provider %s failures as permanent", (status) => {
    expect(classifyDeliveryFailure(status, 1)).toEqual({
      action: "permanent",
      code: "provider_client_error",
    });
  });

  it("makes the third attempt terminal even for an otherwise retryable failure", () => {
    expect(classifyDeliveryFailure(503, 3)).toEqual({
      action: "permanent",
      code: "attempts_exhausted",
    });
  });
});
