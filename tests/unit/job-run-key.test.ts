import {describe, expect, it} from "vitest";

import {runKeyFor} from "@/lib/jobs/handler";
import {PHASE_C_JOB_KIND} from "@/lib/jobs/kinds";

/**
 * Phase C2 Task 10, S-12. A ten-minute cron needs a ten-minute run key.
 *
 * `jobsRepository.claim` only ever reclaims a row in state `failed`, so with the
 * `hourly` bucket ticks 2-6 of every hour would hash to the run key tick 1
 * already completed and the route would answer `200 {"duplicate": true}` — a
 * queue that looks healthy in every log line and in fact drains once an hour.
 * The failure is invisible precisely because a duplicate is the correct answer
 * to a genuine double-invocation.
 */
const SAFE_RUN_KEY = /^[A-Za-z0-9:-]{1,160}$/;

describe("runKeyFor ten-minute bucket", () => {
  it("floors the instant to its ten-minute window", () => {
    expect(runKeyFor(PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE, "ten-minute", new Date("2026-09-10T04:23:45.000Z")))
      .toBe("whatsapp-send-queue:2026-09-10T04:20");
  });

  it("produces a key the job handler will accept", () => {
    // A `.` would fail this and is the reason the key is built by slicing the
    // ISO instant before its seconds rather than by any millisecond arithmetic.
    const runKey = runKeyFor(PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE, "ten-minute", new Date("2026-09-10T04:23:45.678Z"));
    expect(runKey).toMatch(SAFE_RUN_KEY);
    expect(runKey).not.toContain(".");
  });

  it("collapses every instant inside one window and separates the next", () => {
    const key = (instant: string) => runKeyFor(PHASE_C_JOB_KIND.WHATSAPP_SEND_QUEUE, "ten-minute", new Date(instant));

    expect(key("2026-09-10T04:20:00.000Z")).toBe(key("2026-09-10T04:29:59.999Z"));
    expect(key("2026-09-10T04:29:59.999Z")).not.toBe(key("2026-09-10T04:30:00.000Z"));
    expect(key("2026-09-10T04:30:00.000Z")).toBe("whatsapp-send-queue:2026-09-10T04:30");
  });

  it("leaves the hourly and daily buckets exactly as they were", () => {
    expect(runKeyFor("journey-runner", "hourly", new Date("2026-09-10T04:23:45.000Z")))
      .toBe("journey-runner:2026-09-10T04");
    expect(runKeyFor("renewal-runner", "daily", new Date("2026-09-10T04:23:45.000Z")))
      .toBe("renewal-runner:2026-09-10");
  });
});
