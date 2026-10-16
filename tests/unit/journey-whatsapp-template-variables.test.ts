import {drizzle} from "drizzle-orm/pg-proxy";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";

/**
 * C-9 review. The third layer of the journey lane's WhatsApp leg, after consent
 * (`tests/unit/journey-whatsapp-stop.test.ts`) and the runner's refusal
 * (`tests/unit/journey-runner.test.ts`): the BODY parameters.
 *
 * The review found `renewal_14` and `dunning_3` going to the provider with
 * unresolved parameters. `config/whatsapp-templates.ts` declares
 * `[memberName, renewalDate, renewalUrl]` and `[memberName, amountDue, paymentUrl]`,
 * the production context bag built inside `runProductionJourneys` carried
 * neither `memberName` nor `amountDue` — `memberName` was added only in the
 * `event_reminder` branch — and `lib/channels/woztell.ts` fills a missing
 * parameter with `""`. Meta rejects an empty BODY parameter, the adapter maps
 * the 4xx to `provider_client_error`, `classifyDeliveryFailure` makes it
 * permanent, and `settleFailure` raises a staff task. So the first live tick
 * after `RUN_LIVE_WOZTELL=1` would have produced one permanent failure and one
 * staff task per member with a step due, and no member would have received
 * either message.
 *
 * Nothing caught it because every journey fixture hand-writes `memberName` and
 * `amountDue` into `context.variables` (`tests/unit/journey-runner.test.ts`,
 * `tests/integration/automation-runners-postgres.test.ts`) — the fixtures papered
 * over the production wiring. This file drives the REAL `loadContext`, which is
 * built inline inside `runProductionJourneys` and never exported, using the same
 * captured-dependencies technique as
 * `tests/unit/job-runner-context-event-reminder.test.ts`.
 */

const loadJourney = vi.fn();
const loadEventReminder = vi.fn();

// Partial: the singleton is replaced so the wiring can be driven without a
// database, but `createJobRunnerContextRepository` stays REAL — the last describe
// below drives the actual SQL through it, and a fully mocked module would have
// left that half of this file asserting against a stub of itself.
vi.mock("@/lib/db/repos/job-runner-context", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/repos/job-runner-context")>(),
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

import {JOURNEYS} from "@/config/journeys";
import {WHATSAPP_TEMPLATES, type WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import type {JourneyName} from "@/lib/automation/types";
import {automationCronActor} from "@/lib/auth/automation-actor";
import {
  createJobRunnerContextRepository,
  type JobJourneyContextRecord,
} from "@/lib/db/repos/job-runner-context";
import type {AutomationDatabase} from "@/lib/db/repos/journeys";
import type {JourneyClaim} from "@/lib/db/repos/journeys";
import {createJobRunners} from "@/lib/jobs/runners";
import {resolveTemplateBody} from "@/lib/whatsapp/template-body";

const now = new Date("2027-01-15T10:00:00.000Z");
const eventId = "33333333-3333-4333-8333-333333333333";
const membershipId = "44444444-4444-4444-8444-444444444444";
const profileId = "member-template-variables";

/**
 * Typed against the repository contract rather than hand-shaped, for the reason
 * the event-reminder fixture is: a field the repository starts returning has to
 * surface as a type error here, not as a fixture that quietly stops resembling
 * production. Every value is what a real active member's row looks like.
 */
function baseJourneyRow(): JobJourneyContextRecord {
  return {
    profileId,
    email: "member@example.test",
    displayName: "Fixture Member",
    locale: "en" as const,
    lastLoginAt: new Date("2026-12-01T00:00:00.000Z"),
    marketingConsent: true,
    profileComplete: true,
    whatsappOptIn: true,
    whatsappNumber: "+85255550000",
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    engagementScore: 50,
    membershipStatus: "active",
    billingPeriodEnd: new Date("2027-02-01T00:00:00.000Z"),
    amountDueHkd: 1_800,
  };
}

/** Every journey step this phase can put on the wire, read from the config. */
const whatsappSteps = Object.entries(JOURNEYS).flatMap(([journey, steps]) =>
  steps
    .filter((step) => step.channels.includes("whatsapp"))
    .map((step) => ({journey: journey as JourneyName, step})));

function instanceKeyFor(journey: JourneyName): string {
  return journey === "event_reminder" ? `event:${eventId}` : "period:2027-02-01";
}

function claim(journey: JourneyName, step: string): JourneyClaim {
  return {
    id: crypto.randomUUID(),
    profileId,
    membershipId,
    journey,
    instanceKey: instanceKeyFor(journey),
    step,
    scheduledAt: new Date(now.getTime() - 1_000),
    status: "processing",
    attemptCount: 1,
    claimedAt: now,
    claimExpiresAt: new Date(now.getTime() + 300_000),
    deliveryKey: `journey:${profileId}:${journey}:${instanceKeyFor(journey)}:${step}`,
    errorCode: null,
    completedAt: null,
    createdAt: new Date(now.getTime() - 86_400_000),
    updatedAt: now,
    claimSource: "scheduled",
    emailErrorCode: null,
    whatsappErrorCode: null,
  } as JourneyClaim;
}

async function loadContextFor(
  journey: JourneyName,
  step: string,
  journeyRowOverrides: Partial<JobJourneyContextRecord> = {},
) {
  loadJourney.mockResolvedValue({...baseJourneyRow(), ...journeyRowOverrides});
  loadEventReminder.mockResolvedValue({
    eventId,
    slug: "fixture-event",
    titleEn: "Fixture Event",
    titleZh: null,
    startsAt: new Date("2030-03-01T02:00:00.000Z"),
    venue: "KOHO, Kwun Tong",
    deliverable: true,
  });
  // Only the journeys leg is under test; the campaigns leg would open a database.
  const runners = createJobRunners({runCampaigns: async () => ({})});
  await runners.journey(now);
  if (!capturedDeps) throw new Error("runJourneyBatch was not called");
  return capturedDeps.loadContext(automationCronActor(), claim(journey, step));
}

function fakeDatabase(rows: readonly Record<string, unknown>[]): AutomationDatabase {
  const database = {
    execute: async () => ({rows}),
    transaction: async <T,>(work: (tx: AutomationDatabase) => Promise<T>) => work(database),
  } as unknown as AutomationDatabase;
  return database;
}

function journeyRow(overrides: Record<string, unknown> = {}) {
  return {
    profile_id: profileId,
    email: "member@example.test",
    display_name: "Fixture Member",
    locale: "en",
    last_login_at: null,
    consent_marketing: true,
    onboarding_state: "complete",
    whatsapp_opt_in: true,
    whatsapp_number: "+85255550000",
    whatsapp_opted_out_at: null,
    engagement_score: 50,
    membership_status: "active",
    billing_period_end: null,
    amount_due_hkd: 1_800,
    email_suppressed: false,
    ...overrides,
  };
}

describe("the production journey bag resolves every declared BODY parameter (C-9)", () => {
  beforeEach(() => {
    loadJourney.mockReset();
    loadEventReminder.mockReset();
    capturedDeps = undefined;
    // `runProductionJourneys` builds `portalUrl` (appEnv), an email transport
    // (emailEnv) and every unsubscribe link before it reaches `loadContext`.
    vi.unstubAllEnvs();
    vi.stubEnv("APP_URL", "https://example.test");
    vi.stubEnv("EMAIL_DELIVERY_MODE", "test");
    vi.stubEnv("UNSUBSCRIBE_TOKEN_SECRET", "unsubscribe-token-secret-at-least-32-bytes");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  /**
   * Driven from `config/journeys.ts` rather than from a list written here, so a
   * fourth WhatsApp step added later is covered the day it is added — which is
   * the only version of this assertion that stays true.
   */
  it.each(whatsappSteps)(
    "resolves the whole body of $step.template for the $journey journey",
    async ({journey, step}) => {
      const context = await loadContextFor(journey, step.key);
      const template = step.template as WhatsAppTemplateKey;

      const body = resolveTemplateBody(template, context.variables);

      // Named rather than just `not.toBeNull()`: a failure has to say WHICH
      // parameter the provider would have received empty.
      const missing = WHATSAPP_TEMPLATES[template].variables
        .filter((key) => String(context.variables[key] ?? "").trim() === "");
      expect(missing).toEqual([]);
      expect(body).not.toBeNull();
    },
  );

  it("does not fabricate an amount for a membership whose plan records no price", async () => {
    // The fail-closed control, and the reason `amountDue` is derived from a
    // nullable column rather than defaulted. A patron or community plan carries
    // no price for its interval, so there is no honest number to put in
    // `wtia_dunning_d3` parameter 2 — and a fabricated "HK$0.00" chasing a
    // payment is worse than the WhatsApp leg staying quiet while the email
    // still goes out.
    const context = await loadContextFor("dunning", "dunning_3", {amountDueHkd: null});

    expect(context.variables.amountDue ?? "").toBe("");
    expect(resolveTemplateBody("dunning_3", context.variables)).toBeNull();
    // The email leg is untouched: it interpolates `recipientName`, not `amountDue`.
    expect(context.email).toBe("member@example.test");
  });

  it("formats the amount as HKD currency for the recipient's locale", async () => {
    const context = await loadContextFor("dunning", "dunning_3", {amountDueHkd: 1_800});

    // Not a bare integer: the member reads this parameter inside a sentence
    // about money they owe, and "1800" there is ambiguous about the currency in
    // a city that has three of them in daily use.
    expect(String(context.variables.amountDue)).toContain("1,800");
    expect(String(context.variables.amountDue)).toMatch(/HK\$/);
  });

  it("carries the member's name into the renewal body from the profile, not from a fixture", async () => {
    const context = await loadContextFor("renewal", "renewal_14", {displayName: "Chan Tai Man"});

    expect(context.variables.memberName).toBe("Chan Tai Man");
    expect(context.variables.renewalDate).toBe("2027-02-01");
  });
});

describe("loadJourney projects the amount a dunning body needs (C-9)", () => {
  it("joins the plan and selects the price for the membership's billing interval", async () => {
    const statements: string[] = [];
    const proxy = drizzle(async (query: string) => {
      statements.push(query);
      return {rows: []};
    });
    const database = {
      execute: (query: Parameters<AutomationDatabase["execute"]>[0]) => proxy.execute(query),
      transaction: async <T,>(work: (tx: AutomationDatabase) => Promise<T>) => work(database),
    } as AutomationDatabase;

    await createJobRunnerContextRepository(async () => database)
      .loadJourney(automationCronActor(), profileId, membershipId)
      .catch(() => undefined);

    // Comment-stripped for the reason `journey-whatsapp-stop.test.ts` strips:
    // the join is explained in prose directly above it, and a keyword scan over
    // raw text would match the explanation instead of the SQL.
    const rendered = statements.join("\n").replace(/--[^\n]*/g, " ");
    expect(rendered).toMatch(/left join\s+"membership_plans"/i);
    expect(rendered).toMatch(/"membership_plans"\."code"\s*=\s*"memberships"\."plan_code"/i);
    expect(rendered).toMatch(/"membership_plans"\."monthly_price_hkd"/i);
    expect(rendered).toMatch(/"membership_plans"\."annual_price_hkd"/i);
  });

  it("reports the projected amount, and null when the plan has no price", async () => {
    const withPrice = await createJobRunnerContextRepository(
      async () => fakeDatabase([journeyRow()]),
    ).loadJourney(automationCronActor(), profileId, membershipId);
    expect(withPrice.amountDueHkd).toBe(1_800);

    // The positive control: an assertion that only ever saw a price would pass
    // against a column hard-coded to one.
    const withoutPrice = await createJobRunnerContextRepository(
      async () => fakeDatabase([journeyRow({amount_due_hkd: null})]),
    ).loadJourney(automationCronActor(), profileId, membershipId);
    expect(withoutPrice.amountDueHkd).toBeNull();
  });
});
