import {describe, expect, it, vi} from "vitest";

import type {JourneyEnrollment} from "@/lib/db/repos/journeys";
import {
  enrollEventReminder,
  eventIdFromInstanceKey,
  eventReminderVariables,
} from "@/lib/events/reminder-enrollment";

const EVENT = "22222222-2222-4222-8222-222222222222";
const now = () => new Date("2026-09-09T00:00:00Z");

describe("event reminder enrolment (programme B-5)", () => {
  it("schedules one transactional step 24 hours before the start, keyed per profile and event", async () => {
    const enroll = vi.fn(async () => "created" as const);
    await enrollEventReminder(
      {profileId: "p1", eventId: EVENT, startsAt: new Date("2030-03-01T02:00:00.000Z")},
      {journeys: {enroll}, now},
    );
    expect(enroll).toHaveBeenCalledTimes(1);
    const [actor, enrollment] = enroll.mock.calls[0] as unknown as [{kind: string}, JourneyEnrollment];
    expect(actor.kind).toBe("system");
    // The repository contract names the column `step` (journeys.ts JourneyEnrollment), not `stepKey`.
    expect(enrollment).toMatchObject({
      profileId: "p1",
      membershipId: null,
      journey: "event_reminder",
      instanceKey: `event:${EVENT}`,
      step: "reminder_24h",
    });
    expect(enrollment.scheduledAt.toISOString()).toBe("2030-02-28T02:00:00.000Z");
    expect(enrollment.deliveryKey).toBe(`journey:p1:event_reminder:event:${EVENT}:reminder_24h`);
  });

  it("skips events starting within 24 hours", async () => {
    const enroll = vi.fn(async () => "created" as const);
    await enrollEventReminder(
      {profileId: "p1", eventId: EVENT, startsAt: new Date("2026-09-09T10:00:00Z")},
      {journeys: {enroll}, now},
    );
    expect(enroll).not.toHaveBeenCalled();
  });

  it("recovers the event id from the journey instance key and rejects other shapes", () => {
    expect(eventIdFromInstanceKey(`event:${EVENT}`)).toBe(EVENT);
    expect(eventIdFromInstanceKey("activation:abc")).toBeNull();
    expect(eventIdFromInstanceKey("event:")).toBeNull();
    expect(eventIdFromInstanceKey("event:not-a-uuid")).toBeNull();
  });

  it.each([
    ["en", "Fixture Event", "1 March 2030 at 10:00", "https://www.hkwtia.org/events/fixture-event"],
    ["zh-HK", "示範活動", "2030年3月1日 上午10:00", "https://www.hkwtia.org/zh/events/fixture-event"],
  ] as const)("renders %s runner variables in Hong Kong time with an absolute localized event URL", (locale, title, startsAt, url) => {
    const variables = eventReminderVariables({
      locale,
      appUrl: "https://www.hkwtia.org",
      event: {
        slug: "fixture-event",
        titleEn: "Fixture Event",
        titleZh: "示範活動",
        startsAt: new Date("2030-03-01T02:00:00.000Z"),
        venue: "KOHO, Kwun Tong",
      },
    });
    expect(variables).toEqual({
      eventTitle: title,
      startsAt,
      venue: "KOHO, Kwun Tong",
      eventUrl: url,
      ctaUrl: url,
    });
  });

  it("falls back to the English title and an empty venue", () => {
    const variables = eventReminderVariables({
      locale: "zh-HK",
      appUrl: "https://www.hkwtia.org/",
      event: {slug: "s", titleEn: "Only English", titleZh: null, startsAt: new Date("2030-03-01T02:00:00.000Z"), venue: null},
    });
    expect(variables.eventTitle).toBe("Only English");
    expect(variables.venue).toBe("");
    expect(variables.eventUrl).toBe("https://www.hkwtia.org/zh/events/s");
  });
});
