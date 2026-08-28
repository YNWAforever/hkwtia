import {createElement} from "react";
import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {EventForm} from "@/components/admin/event-form";
import {eventFormInput} from "@/lib/admin/event-form-input";
import {createEvent, updateEvent, type EventMutationDependencies} from "@/lib/db/repos/events";
import {setMediaArchived, type MediaMutationDependencies} from "@/lib/db/repos/media";
import type {Actor} from "@/lib/membership/lifecycle";

const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const heroMediaId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const createInput = {
  slug: "public-event",
  titleEn: "Public event",
  descriptionEn: "Event description",
  startsAt: "2030-01-01T18:00:00.000Z",
  heroMediaId,
};

function storedEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: eventId,
    slug: "public-event",
    titleEn: "Public event",
    titleZh: null,
    descriptionEn: "Event description",
    descriptionZh: null,
    startsAt: new Date("2030-01-01T18:00:00.000Z"),
    endsAt: null,
    venue: null,
    capacity: null,
    memberOnly: false,
    published: false,
    heroMediaId: null,
    createdAt: new Date("2029-01-01T00:00:00.000Z"),
    updatedAt: new Date("2029-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("Event hero administration and media lifecycle", () => {
  it("offers only supplied active media IDs in the Event hero selector", () => {
    render(createElement(EventForm, {
      action: async () => ({}),
      labels: {slug: "Slug", titleEn: "Title", titleZh: "Title", descriptionEn: "Description", descriptionZh: "Description", startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", memberOnly: "Members", published: "Published", heroMediaId: "Hero media", noHeroMedia: "No hero media", save: "Save", saving: "Saving"},
      mediaRows: [{id: heroMediaId, altEn: "Active image", altZh: "啟用圖片"}],
    }));

    const selector = screen.getByLabelText("Hero media");
    expect(selector).toHaveAttribute("name", "heroMediaId");
    expect(screen.getByRole("option", {name: "Active image / 啟用圖片"})).toHaveValue(heroMediaId);
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["", heroMediaId]);
  });

  it("normalizes an empty heroMediaId and rejects archived media inside the write transaction", async () => {
    const form = new FormData();
    form.set("slug", "public-event");
    form.set("titleEn", "Public event");
    form.set("descriptionEn", "Event description");
    form.set("startsAt", "2030-01-01T18:00");
    form.set("heroMediaId", "");
    expect(eventFormInput(form)).toMatchObject({heroMediaId: null});

    const inactiveMediaDependencies: EventMutationDependencies = {
      transaction: (work) => work({
        lockActiveMedia: vi.fn(async () => ({id: heroMediaId, archivedAt: new Date()})),
        insertEvent: vi.fn(),
        lockEvent: vi.fn(),
        updateEvent: vi.fn(),
        insertAudit: vi.fn(),
      } as never),
    };
    await expect(createEvent(staff, createInput, inactiveMediaDependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: ["heroMediaId"]})]});
  });

  it.each([
    ["missing", null],
    ["archived", {id: heroMediaId, archivedAt: new Date()}],
  ])("rejects %s hero media before Event creation writes or audits", async (_kind, mediaRow) => {
    const insertEvent = vi.fn();
    const insertAudit = vi.fn();
    const dependencies: EventMutationDependencies = {
      transaction: (work) => work({
        lockActiveMedia: vi.fn(async () => mediaRow),
        insertEvent,
        lockEvent: vi.fn(),
        updateEvent: vi.fn(),
        insertAudit,
      } as never),
    };

    await expect(createEvent(staff, createInput, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: ["heroMediaId"], message: "EVENT_HERO_MEDIA_INVALID"})]});
    expect(insertEvent).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it.each([
    ["missing", null],
    ["archived", {id: heroMediaId, archivedAt: new Date()}],
  ])("rejects %s hero media before Event update writes or audits", async (_kind, mediaRow) => {
    const updateEventRow = vi.fn();
    const insertAudit = vi.fn();
    const dependencies: EventMutationDependencies = {
      transaction: (work) => work({
        lockActiveMedia: vi.fn(async () => mediaRow),
        insertEvent: vi.fn(),
        lockEvent: vi.fn(async () => storedEvent()),
        updateEvent: updateEventRow,
        insertAudit,
      } as never),
    };

    await expect(updateEvent(staff, eventId, {heroMediaId}, dependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({path: ["heroMediaId"], message: "EVENT_HERO_MEDIA_INVALID"})]});
    expect(updateEventRow).not.toHaveBeenCalled();
    expect(insertAudit).not.toHaveBeenCalled();
  });

  it("writes a selected active hero and explicitly clears a selected hero", async () => {
    const insertEvent = vi.fn(async (input) => storedEvent(input));
    const createAudit = vi.fn();
    const createDependencies: EventMutationDependencies = {
      transaction: (work) => work({
        lockActiveMedia: vi.fn(async () => ({id: heroMediaId, archivedAt: null})),
        insertEvent,
        lockEvent: vi.fn(),
        updateEvent: vi.fn(),
        insertAudit: createAudit,
      } as never),
    };
    await expect(createEvent(staff, createInput, createDependencies))
      .resolves.toMatchObject({heroMediaId});
    expect(insertEvent).toHaveBeenCalledWith(expect.objectContaining({heroMediaId}));
    expect(createAudit).toHaveBeenCalledOnce();

    const lockActiveMedia = vi.fn();
    const updateEventRow = vi.fn(async (_id, input) => storedEvent(input));
    const updateAudit = vi.fn();
    const updateDependencies: EventMutationDependencies = {
      transaction: (work) => work({
        lockActiveMedia,
        insertEvent: vi.fn(),
        lockEvent: vi.fn(async () => storedEvent({heroMediaId})),
        updateEvent: updateEventRow,
        insertAudit: updateAudit,
      } as never),
    };
    await expect(updateEvent(staff, eventId, {heroMediaId: null}, updateDependencies))
      .resolves.toMatchObject({heroMediaId: null});
    expect(lockActiveMedia).not.toHaveBeenCalled();
    expect(updateEventRow).toHaveBeenCalledWith(eventId, {heroMediaId: null});
    expect(updateAudit).toHaveBeenCalledOnce();
  });

  it("requires an Event hero counter before an archive decision", async () => {
    const setArchivedAt = vi.fn(async () => storedEvent());
    const missingCounterDependencies: MediaMutationDependencies = {
      transaction: (work) => work({
        findByUrl: vi.fn(),
        insertMedia: vi.fn(),
        lockMedia: vi.fn(async () => ({id: heroMediaId, url: "/api/media/11111111-1111-4111-8111-111111111111", archivedAt: null})),
        updateMedia: vi.fn(),
        countListingReferences: vi.fn(async () => 0),
        countPartnerReferences: vi.fn(async () => 0),
        setArchivedAt,
        insertAudit: vi.fn(),
      } as never),
    };

    await expect(setMediaArchived(staff, heroMediaId, true, missingCounterDependencies))
      .rejects.toThrow("countEventHeroReferences");
    expect(setArchivedAt).not.toHaveBeenCalled();
  });

  it("invokes the Event hero counter and blocks an archive before writing", async () => {
    const countEventHeroReferences = vi.fn(async () => 1);
    const setArchivedAt = vi.fn();
    const eventReferencedMediaDependencies: MediaMutationDependencies = {
      transaction: (work) => work({
        findByUrl: vi.fn(),
        insertMedia: vi.fn(),
        lockMedia: vi.fn(async () => ({id: heroMediaId, url: "/api/media/11111111-1111-4111-8111-111111111111", archivedAt: null})),
        updateMedia: vi.fn(),
        countListingReferences: vi.fn(async () => 0),
        countPartnerReferences: vi.fn(async () => 0),
        countEventHeroReferences,
        setArchivedAt,
        insertAudit: vi.fn(),
      } as never),
    };

    await expect(setMediaArchived(staff, heroMediaId, true, eventReferencedMediaDependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({message: "MEDIA_IN_USE"})]});
    expect(countEventHeroReferences).toHaveBeenCalledExactlyOnceWith(heroMediaId);
    expect(setArchivedAt).not.toHaveBeenCalled();
  });
});
