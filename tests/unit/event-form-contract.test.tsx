import {fireEvent, render, screen} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import {z} from "zod";

import {EventForm} from "@/components/admin/event-form";
import {runEventFormAction} from "@/lib/admin/event-action-core";
import {eventFormInput} from "@/lib/admin/event-form-input";
import {createEvent, updateEvent, type EventMutationDependencies} from "@/lib/db/repos/events";

const staff = {kind: "staff", userId: "auth-staff", profileId: "profile-staff"} as const;
const fields = {
  slug: "ai-clinic", titleEn: "AI clinic", descriptionEn: "Hands on",
  startsAt: "2099-09-01T10:00", endsAt: "2099-09-01T12:00", venue: "Hong Kong",
  format: "online", onlineUrl: "https://meet.example.test/ai",
  registrationMode: "external", externalRegistrationUrl: "https://register.example.test/ai",
  visibility: "public", tags: "AI, Machine Learning",
};
function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries({...fields, ...overrides})) data.set(key, value);
  return data;
}
const deps: EventMutationDependencies = {transaction: async (work) => work({
  insertEvent: vi.fn(async (input) => ({id: "11111111-1111-4111-8111-111111111111", ...input})),
  lockEvent: vi.fn(), updateEvent: vi.fn(), lockActiveMedia: vi.fn(), insertAudit: vi.fn(async () => undefined),
})};
const labels = {
  slug: "Slug", titleEn: "English title", titleZh: "Chinese title", descriptionEn: "English description", descriptionZh: "Chinese description",
  startsAt: "Starts", endsAt: "Ends", venue: "Venue", capacity: "Capacity", registrationMode: "Registration",
  registrationModes: {rsvp: "RSVP", external: "External", ticketed: "Ticketed"}, ticketPriceHkdCents: "Ticket price",
  memberOnly: "Members only", published: "Published", heroMediaId: "Hero", noHeroMedia: "No hero", save: "Save", saving: "Saving",
  format: "Format", formats: {in_person: "In person", online: "Online", hybrid: "Hybrid"}, onlineUrl: "Online URL",
  externalRegistrationUrl: "External registration URL", tags: "Tags", visibility: "Visibility",
  visibilities: {public: "Public", members_only: "Members only", invite_only: "Invite only"},
};

describe("admin event form contract", () => {
  it("round-trips external online fields and tags through the real event write schema", async () => {
    const parsed = eventFormInput(form());
    expect(parsed).toMatchObject({format: "online", onlineUrl: "https://meet.example.test/ai", registrationMode: "external", externalRegistrationUrl: "https://register.example.test/ai", tags: ["AI", "Machine Learning"], visibility: "public"});
    await expect(createEvent(staff, parsed, deps)).resolves.toMatchObject({format: "online", onlineUrl: "https://meet.example.test/ai", externalRegistrationUrl: "https://register.example.test/ai", tags: ["ai", "machine-learning"]});
  });

  it("retains external, hybrid and tag fields when an existing event is edited", async () => {
    const current = await createEvent(staff, eventFormInput(form({format: "hybrid"})), deps);
    const update = vi.fn(async (_id, input) => ({...current, ...input}));
    const updateDeps: EventMutationDependencies = {transaction: async (work) => work({
      insertEvent: vi.fn(), lockEvent: vi.fn(async () => current), updateEvent: update,
      lockActiveMedia: vi.fn(), insertAudit: vi.fn(async () => undefined),
    })};
    const next = eventFormInput(form({format: "hybrid", titleEn: "Revised AI clinic"}));
    await expect(updateEvent(staff, current.id, next, updateDeps)).resolves.toMatchObject({
      titleEn: "Revised AI clinic", format: "hybrid", onlineUrl: fields.onlineUrl,
      externalRegistrationUrl: fields.externalRegistrationUrl, tags: ["ai", "machine-learning"],
    });
    expect(update).toHaveBeenCalledWith(current.id, expect.objectContaining({externalRegistrationUrl: fields.externalRegistrationUrl}));
  });

  it("blocks publication of the exact audited demo event on create and update", async () => {
    const slug = "wtia-global-growth-demo-briefing-2026";
    const published = eventFormInput(form({slug, published: "on"}));
    await expect(createEvent(staff, published, deps)).rejects.toThrow("DEMO_EVENT_PUBLICATION_BLOCKED");

    const draft = await createEvent(staff, eventFormInput(form({slug})), deps);
    const update = vi.fn();
    const updateDeps: EventMutationDependencies = {transaction: async (work) => work({
      insertEvent: vi.fn(), lockEvent: vi.fn(async () => draft), updateEvent: update,
      lockActiveMedia: vi.fn(), insertAudit: vi.fn(async () => undefined),
    })};
    await expect(updateEvent(staff, draft.id, published, updateDeps)).rejects.toThrow("DEMO_EVENT_PUBLICATION_BLOCKED");
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects empty and unsafe external URLs", async () => {
    for (const externalRegistrationUrl of ["", "javascript:alert(1)", "ftp://example.test/ai"]) {
      await expect(createEvent(staff, eventFormInput(form({externalRegistrationUrl})), deps)).rejects.toThrow(z.ZodError);
    }
  });

  it("retains external URL, online URL and tags after an invalid Hong Kong date", async () => {
    const state = await runEventFormAction({}, form({startsAt: "2099-02-30T10:00"}), {
      successMessage: "Saved", validationMessage: "Check fields", errorMessage: "Try again",
      mutate: async (data) => { eventFormInput(data); },
    });
    expect(state).toMatchObject({status: "error", fieldErrors: {startsAt: "Check fields"}, values: {
      externalRegistrationUrl: fields.externalRegistrationUrl, onlineUrl: fields.onlineUrl,
      tags: fields.tags, format: "online", visibility: "public",
    }});
  });

  it("clears mode-specific values when registration and format change", () => {
    const parsed = eventFormInput(form({registrationMode: "rsvp", format: "in_person", ticketPriceHkdCents: "250"}));
    expect(parsed).toMatchObject({registrationMode: "rsvp", externalRegistrationUrl: null, ticketPriceHkdCents: null, format: "in_person", onlineUrl: null});
  });

  it("shows only fields relevant to the selected modes and retains edit values", () => {
    render(<EventForm action={vi.fn(async () => ({}))} labels={labels} values={{
      registrationMode: "external", externalRegistrationUrl: fields.externalRegistrationUrl,
      format: "online", onlineUrl: fields.onlineUrl, tags: ["ai"], visibility: "members_only",
    }} />);
    expect(screen.getByLabelText("External registration URL")).toHaveValue(fields.externalRegistrationUrl);
    expect(screen.getByLabelText("Online URL")).toHaveValue(fields.onlineUrl);
    expect(screen.getByLabelText("Tags")).toHaveValue("ai");
    expect(screen.queryByLabelText("Ticket price")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Registration"), {target: {value: "ticketed"}});
    expect(screen.getByLabelText("Ticket price")).toBeInTheDocument();
    expect(screen.queryByLabelText("External registration URL")).not.toBeInTheDocument();
  });
});
