import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

// Programme B-5: `runProductionJourneys`' `loadContext` builds the
// `event_reminder` branch inline and is never exported, so this captures the
// `deps` object `runJourneyBatch` receives (mocked below) and calls its
// `loadContext` directly — the same technique as
// tests/unit/renewal-production-dependencies.test.ts, but for the runner
// wiring rather than the SQL it issues.

const loadJourney = vi.fn();
const loadEventReminder = vi.fn();

vi.mock("@/lib/db/repos/job-runner-context", () => ({
  jobRunnerContextRepository: {
    loadJourney: (...args: unknown[]) => loadJourney(...args),
    loadEventReminder: (...args: unknown[]) => loadEventReminder(...args),
  },
}));

let capturedDeps: Parameters<
  typeof import("@/lib/automation/journey-runner").runJourneyBatch
>[0] | undefined;

vi.mock("@/lib/automation/journey-runner", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/automation/journey-runner")>();
  return {
    ...actual,
    runJourneyBatch: vi.fn(async (deps: typeof capturedDeps) => {
      capturedDeps = deps;
      return {claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0};
    }),
  };
});

import {automationCronActor} from "@/lib/auth/automation-actor";
import type {JobJourneyContextRecord} from "@/lib/db/repos/job-runner-context";
import type {JourneyClaim} from "@/lib/db/repos/journeys";
import {createJobRunners} from "@/lib/jobs/runners";

const now = new Date("2027-01-15T10:00:00.000Z");
const eventId = "33333333-3333-4333-8333-333333333333";
const profileId = "member-event-reminder";

// Typed against the repository contract, not hand-shaped: the loader is mocked
// here, so a field the repository starts returning (whatsappOptedOutAt was the
// last one) must show up as a type error rather than as a fixture that quietly
// stops resembling production.
function baseJourneyRow(): JobJourneyContextRecord {
  return {
    profileId,
    email: "member@example.test",
    displayName: "Fixture Member",
    locale: "en" as const,
    lastLoginAt: null,
    marketingConsent: true,
    profileComplete: true,
    whatsappOptIn: true,
    whatsappNumber: "+85255550000",
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    engagementScore: 50,
    membershipStatus: null,
    billingPeriodEnd: null,
  };
}

function claim(overrides: Partial<JourneyClaim> = {}): JourneyClaim {
  return {
    id: crypto.randomUUID(),
    profileId,
    membershipId: null,
    journey: "event_reminder",
    instanceKey: `event:${eventId}`,
    step: "reminder_24h",
    scheduledAt: new Date(now.getTime() - 1_000),
    status: "processing",
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    deliveryKey: `journey:${profileId}:event_reminder:event:${eventId}:reminder_24h`,
    errorCode: null,
    completedAt: null,
    createdAt: new Date(now.getTime() - 86_400_000),
    updatedAt: now,
    claimSource: "scheduled",
    emailErrorCode: null,
    whatsappErrorCode: null,
    ...overrides,
  } as JourneyClaim;
}

async function loadContextFor(
  claimOverrides: Partial<JourneyClaim> = {},
  journeyRowOverrides: Partial<JobJourneyContextRecord> = {},
) {
  loadJourney.mockResolvedValue({...baseJourneyRow(), ...journeyRowOverrides});
  // Only the journeys leg is under test; the campaigns leg (unrelated to
  // this branch) is overridden to a no-op so an unmocked DB call there can't
  // fail the batch and mask what we're asserting on.
  const runners = createJobRunners({runCampaigns: async () => ({})});
  await runners.journey(now);
  if (!capturedDeps) throw new Error("runJourneyBatch was not called");
  return capturedDeps.loadContext(automationCronActor(), claim(claimOverrides));
}

describe("runProductionJourneys loadContext — event_reminder branch (B-5)", () => {
  beforeEach(() => {
    loadJourney.mockReset();
    loadEventReminder.mockReset();
    capturedDeps = undefined;
    // runProductionJourneys builds `portalUrl` (appEnv), an email transport
    // (emailEnv) and every unsubscribe link (unsubscribeEnv) before it ever
    // calls `loadContext` — unset in the test environment, each throws (an
    // invalid URL base, a real Resend SDK construction, a missing token
    // secret) before we can capture the deps we're here to exercise.
    vi.unstubAllEnvs();
    vi.stubEnv("APP_URL", "https://example.test");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "test");
    vi.stubEnv("UNSUBSCRIBE_TOKEN_SECRET", "unsubscribe-token-secret-at-least-32-bytes");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("supplies the event variables for a deliverable event", async () => {
    loadEventReminder.mockResolvedValue({
      eventId,
      slug: "fixture-event",
      titleEn: "Fixture Event",
      titleZh: null,
      startsAt: new Date("2030-03-01T02:00:00.000Z"),
      venue: "KOHO, Kwun Tong",
      deliverable: true,
    });

    const context = await loadContextFor();

    expect(loadEventReminder).toHaveBeenCalledWith(
      expect.anything(),
      profileId,
      eventId,
    );
    expect(context.email).toBe("member@example.test");
    expect(context.whatsappNumber).toBe("+85255550000");
    expect(context.variables).toMatchObject({
      eventTitle: "Fixture Event",
      startsAt: expect.any(String),
      venue: "KOHO, Kwun Tong",
      eventUrl: expect.stringContaining("/events/fixture-event"),
      memberName: "Fixture Member",
    });
  });

  it("nulls both channels when the loaded event is not deliverable", async () => {
    loadEventReminder.mockResolvedValue({
      eventId,
      slug: "fixture-event",
      titleEn: "Fixture Event",
      titleZh: null,
      startsAt: new Date("2030-03-01T02:00:00.000Z"),
      venue: null,
      deliverable: false,
    });

    const context = await loadContextFor();

    expect(context.email).toBeNull();
    expect(context.whatsappNumber).toBeNull();
  });

  it("nulls both channels when no reminder context is found", async () => {
    loadEventReminder.mockResolvedValue(null);

    const context = await loadContextFor();

    expect(context.email).toBeNull();
    expect(context.whatsappNumber).toBeNull();
  });

  /**
   * C-9 review, and it lives here because this file already owns the only
   * harness that can reach `loadContext` — it is built inline inside
   * `runProductionJourneys` and never exported.
   *
   * The repository reads both consent stores and the runner refuses on either
   * (`tests/unit/journey-whatsapp-stop.test.ts`, `tests/unit/journey-runner.test.ts`).
   * This is the join between them: the field is REQUIRED on
   * `JourneyRunnerContext`, so a wiring that dropped it would not compile — but
   * one that hard-coded `whatsappOptedOutAt: null` would, and that is a marketing
   * template sent to somebody who replied STOP with every type check green.
   */
  it("carries the contact-side withdrawal from the repository into the runner context", async () => {
    const stoppedAt = new Date("2027-01-10T02:00:00.000Z");
    loadEventReminder.mockResolvedValue({
      eventId,
      slug: "fixture-event",
      titleEn: "Fixture Event",
      titleZh: null,
      startsAt: new Date("2030-03-01T02:00:00.000Z"),
      venue: null,
      deliverable: true,
    });

    const context = await loadContextFor({}, {whatsappOptedOutAt: stoppedAt});

    expect(context.whatsappOptedOutAt).toEqual(stoppedAt);
    // Still true, which is the whole point: the flag alone would have sent.
    expect(context.whatsappOptIn).toBe(true);
  });
});
