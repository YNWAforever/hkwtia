import {describe, expect, it} from "vitest";

import type {MemberEventRow} from "@/lib/db/repos/events";
import {memberEventInputFromFormData, memberEventViewFromRow} from "@/lib/events/member-contract";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

// The repository parses rows with `z.coerce.date()`, so a real row carries
// `Date` objects; the view mapper is written to accept the ISO strings a
// serialised row would carry too, which is what this fixture exercises.
const row = {
  id: "22222222-2222-4222-8222-222222222222", slug: "x", title_en: "X", title_zh: null, description_en: "d", description_zh: null,
  starts_at: "2030-03-01T02:00:00.000Z", ends_at: null, venue: null, capacity: null, status: "rejected", visibility: "public",
  format: "in_person", online_url: null, registration_mode: "rsvp", external_registration_url: null, tags: ["ai"],
  hero_media_id: null, organiser_company_id: "11111111-1111-4111-8111-111111111111", submitted_by_profile_id: null,
  rejection_reason: "duplicate", submitted_at: null, published_at: null, reviewed_at: null,
} as unknown as MemberEventRow;

describe("member event contract (programme B-2)", () => {
  it("reads Hong Kong datetime-local fields, comma tags and optional urls", () => {
    const input = memberEventInputFromFormData(form({
      slug: "ai-clinic-2026", titleEn: "AI Clinic", titleZh: "", descriptionEn: "Hands-on", descriptionZh: "",
      startsAt: "2030-03-01T10:00", endsAt: "2030-03-01T12:00", venue: "KOHO", capacity: "40",
      format: "hybrid", onlineUrl: "https://meet.example/x", visibility: "public", registrationMode: "rsvp",
      externalRegistrationUrl: "", tags: "ai, health ,", heroMediaId: "",
    }));
    expect(input).toMatchObject({slug: "ai-clinic-2026", titleZh: null, capacity: 40, format: "hybrid", tags: ["ai", "health"], heroMediaId: null, externalRegistrationUrl: null});
    expect(input.startsAt.toISOString()).toBe("2030-03-01T02:00:00.000Z");
    expect(input.endsAt?.toISOString()).toBe("2030-03-01T04:00:00.000Z");
  });

  it("falls back to the safe enum values for unknown selects", () => {
    const input = memberEventInputFromFormData(form({
      slug: "s", titleEn: "T", descriptionEn: "d", startsAt: "2030-03-01T10:00", format: "invite_only", visibility: "invite_only", registrationMode: "ticketed",
    }));
    expect(input).toMatchObject({format: "in_person", visibility: "public", registrationMode: "rsvp", endsAt: null, capacity: null, tags: []});
  });

  it("maps a snake_case row to the edit view", () => {
    const view = memberEventViewFromRow(row);
    expect(view).toMatchObject({id: "22222222-2222-4222-8222-222222222222", status: "rejected", rejectionReason: "duplicate", startsAtLocal: "2030-03-01T10:00", endsAtLocal: "", tags: "ai", capacity: "", submittedAt: null});
  });

  it("formats Date-typed columns the same way as strings", () => {
    const view = memberEventViewFromRow({...row, starts_at: new Date("2030-03-01T02:00:00.000Z"), submitted_at: new Date("2030-02-01T00:00:00.000Z"), capacity: 40});
    expect(view).toMatchObject({startsAtLocal: "2030-03-01T10:00", submittedAt: "2030-02-01T00:00:00.000Z", capacity: "40"});
  });
});
