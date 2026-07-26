import {describe, expect, it} from "vitest";

import {safeEqual, verifyCronBearer} from "@/lib/jobs/auth";

function request(authorization?: string): Request {
  const headers: HeadersInit = authorization === undefined ? {} : {authorization};
  return new Request("http://localhost/api/jobs/journey-runner", {headers});
}

describe("job bearer authentication", () => {
  it("accepts one exact configured bearer token", () => {
    expect(verifyCronBearer(request("Bearer cron-secret"), "cron-secret")).toBe(true);
  });

  it.each([
    undefined,
    "",
    "   ",
  ])("rejects a missing or empty configured secret", (secret) => {
    expect(() => verifyCronBearer(request("Bearer cron-secret"), secret)).not.toThrow();
    expect(verifyCronBearer(request("Bearer cron-secret"), secret)).toBe(false);
  });

  it.each([
    undefined,
    "",
    "Bearer",
    "Bearer ",
    "Bearer  cron-secret",
    "Basic cron-secret",
    "bearer cron-secret",
    "Bearer cron secret",
  ])("rejects missing or malformed Authorization header %s", (authorization) => {
    expect(() => verifyCronBearer(request(authorization), "cron-secret")).not.toThrow();
    expect(verifyCronBearer(request(authorization), "cron-secret")).toBe(false);
  });

  it.each([
    "wrong-value",
    "short",
    "a-much-longer-wrong-secret",
  ])("rejects equal- and different-length wrong tokens without throwing", (candidate) => {
    expect(() => safeEqual(candidate, "cron-secret")).not.toThrow();
    expect(safeEqual(candidate, "cron-secret")).toBe(false);
    expect(() => verifyCronBearer(request(`Bearer ${candidate}`), "cron-secret")).not.toThrow();
    expect(verifyCronBearer(request(`Bearer ${candidate}`), "cron-secret")).toBe(false);
  });
});
