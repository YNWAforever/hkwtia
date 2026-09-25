import {drizzle} from "drizzle-orm/pg-proxy";
import {describe, expect, it, vi} from "vitest";

import type {Event} from "@/lib/db/server-schema";
import {getPublicEventBySlug, listPublicEvents} from "@/lib/db/repos/events";
import type {Actor} from "@/lib/membership/lifecycle";
import {legacyDerivedEventColumns} from "@/tests/fixtures/event-row";

const database = vi.hoisted(() => ({current: null as unknown}));

// The SQL branch of the two public reads is unreachable through `source`, and
// no unit test runs a statement against Postgres, so the conflation guard for
// that branch renders the query through the pg-proxy driver and reads it back.
vi.mock("@/lib/db/repos/common", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/db/repos/common")>();
  return {...original, getDb: async () => database.current};
});

const anonymous: Actor = {kind: "anonymous", userId: null};
const asOf = new Date("2030-01-01T10:00:00.000Z");

function event(slug: string, overrides: Partial<Event> = {}): Event {
  const row = {id: `${slug}-id`, slug, titleEn: `${slug} title`, titleZh: null, descriptionEn: `${slug} description`, descriptionZh: null, startsAt: new Date("2030-01-01T09:00:00.000Z"), endsAt: new Date("2030-01-01T12:00:00.000Z"), venue: "WTIA", capacity: null, memberOnly: false, published: true, heroMediaId: null, createdAt: new Date("2026-07-20T00:00:00.000Z"), updatedAt: new Date("2026-07-20T00:00:00.000Z"), ...overrides};
  return {...legacyDerivedEventColumns(row), ...row};
}

function capture() {
  const calls: {query: string; params: readonly unknown[]}[] = [];
  database.current = drizzle(async (query: string, params: readonly unknown[]) => {
    calls.push({query, params});
    return {rows: []};
  });
  return calls;
}

describe("the public reads and a cancelled event", () => {
  const cancelled = event("cancelled-public", {published: false, status: "cancelled", visibility: "public"});
  const draft = event("draft-public", {published: false, status: "draft", visibility: "public"});
  const pending = event("pending-public", {published: false, status: "pending_review", visibility: "public"});
  const published = event("published-public", {status: "published", visibility: "public"});
  const source = [cancelled, draft, pending, published];

  it("returns a cancelled event from the detail read, marked as cancelled", async () => {
    await expect(getPublicEventBySlug("cancelled-public", "en", {asOf, source})).resolves.toMatchObject({slug: "cancelled-public", cancelled: true});
  });

  it("widens admission to cancelled and nothing else: draft and pending_review still 404", async () => {
    await expect(getPublicEventBySlug("draft-public", "en", {asOf, source})).resolves.toBeNull();
    await expect(getPublicEventBySlug("pending-public", "en", {asOf, source})).resolves.toBeNull();
  });

  // The assertion that stops the two reads being conflated: a cancelled event is
  // reachable at its own address but is never an opportunity to attend, so
  // widening `isPubliclyVisible` instead of adding a sibling would fail here.
  it("keeps the listing free of a cancelled event", async () => {
    const open = (await listPublicEvents(anonymous, {status: "open", asOf, locale: "en", source})).map((item) => item.slug);
    const past = (await listPublicEvents(anonymous, {status: "past", asOf, locale: "en", source})).map((item) => item.slug);
    expect(open).toEqual(["published-public"]);
    expect(past).toEqual([]);
  });

  it("marks a published event as not cancelled", async () => {
    await expect(getPublicEventBySlug("published-public", "en", {asOf, source})).resolves.toMatchObject({slug: "published-public", cancelled: false});
  });

  // The SQL branch without `source`. `isPubliclyVisible` is shared by the listing,
  // so the cancelled arm must land on the detail read's own filter only.
  it("admits cancelled in the detail read's SQL and leaves the listing's alone", async () => {
    const detail = capture();
    await getPublicEventBySlug("cancelled-public", "en", {asOf});
    expect(detail.flatMap((call) => call.params)).toContain("cancelled");

    const listing = capture();
    await listPublicEvents(anonymous, {status: "open", asOf, locale: "en"});
    const listingParams = listing.flatMap((call) => call.params);
    expect(listingParams).toContain("published");
    expect(listingParams).not.toContain("cancelled");
  });
});
