import {createElement} from "react";
import {render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";

import {EventForm} from "@/components/admin/event-form";
import {eventFormInput} from "@/lib/admin/event-form-input";
import {createEvent, type EventMutationDependencies} from "@/lib/db/repos/events";
import {setMediaArchived, type MediaMutationDependencies} from "@/lib/db/repos/media";
import type {Actor} from "@/lib/membership/lifecycle";

const staff: Actor = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"};
const heroMediaId = "11111111-1111-4111-8111-111111111111";
const createInput = {
  slug: "public-event",
  titleEn: "Public event",
  descriptionEn: "Event description",
  startsAt: "2030-01-01T18:00:00.000Z",
  heroMediaId,
};

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

  it("rejects archiving media referenced by an Event hero", async () => {
    const eventReferencedMediaDependencies: MediaMutationDependencies = {
      transaction: (work) => work({
        findByUrl: vi.fn(),
        insertMedia: vi.fn(),
        lockMedia: vi.fn(async () => ({id: heroMediaId, url: "/api/media/11111111-1111-4111-8111-111111111111", archivedAt: null})),
        updateMedia: vi.fn(),
        countListingReferences: vi.fn(async () => 0),
        countPartnerReferences: vi.fn(async () => 0),
        countEventHeroReferences: vi.fn(async () => 1),
        setArchivedAt: vi.fn(),
        insertAudit: vi.fn(),
      } as never),
    };
    await expect(setMediaArchived(staff, heroMediaId, true, eventReferencedMediaDependencies))
      .rejects.toMatchObject({issues: [expect.objectContaining({message: "MEDIA_IN_USE"})]});
  });
});
