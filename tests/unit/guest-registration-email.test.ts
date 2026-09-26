import {beforeEach, describe, expect, it, vi} from "vitest";

const {register, renderEmail, send} = vi.hoisted(() => ({
  register: vi.fn(),
  renderEmail: vi.fn(async ({template}: {template: string}) => ({
    subject: template, html: "<p>Receipt</p>", text: "Receipt", headers: {},
  })),
  send: vi.fn(async () => undefined),
}));

vi.mock("next/headers", () => ({headers: async () => new Headers({"x-forwarded-for": "203.0.113.21"})}));
vi.mock("@/lib/config/env", () => ({
  appEnv: () => ({appUrl: "https://hkwtia.example"}),
  emailEnv: () => ({emailFrom: "events@hkwtia.example"}),
  unsubscribeEnv: () => ({unsubscribeTokenSecret: "s".repeat(32)}),
}));
vi.mock("@/lib/db/repos/contacts", () => ({
  contactWriterActor: (source: string) => ({kind: "contact-writer", source}),
  contactsRepository: {upsertFromInterestForm: async () => ({id: "contact-1"})},
}));
vi.mock("@/lib/db/repos/event-guests", () => ({eventGuestsRepository: {register}}));
vi.mock("@/lib/email/render", () => ({renderEmail}));
vi.mock("@/lib/email/transport", () => ({createConfiguredEmailTransport: () => ({send})}));

import {submitGuestRsvpAction} from "@/lib/events/guest-registration-action";

const EVENT = "22222222-2222-4222-8222-222222222222";
function form(email: string): FormData {
  const data = new FormData();
  data.set("eventId", EVENT);
  data.set("name", "Ada");
  data.set("email", email);
  data.set("locale", "en");
  return data;
}

describe("guest RSVP email selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["registered", "event_guest_confirmation"],
    ["waitlist", "event_guest_waitlist"],
  ] as const)("sends a %s guest the matching transactional receipt", async (status, template) => {
    register.mockImplementation(async (_actor: unknown, input: {cancelTokenDigest: string}) => ({
      id: "guest-1", disposition: status, status,
      cancelTokenDigest: input.cancelTokenDigest, eventTitle: "AI Clinic", slug: "ai-clinic",
    }));

    await expect(submitGuestRsvpAction(form(`ada-${status}@example.hk`)))
      .resolves.toEqual({ok: true, disposition: status});
    expect(renderEmail).toHaveBeenCalledWith(expect.objectContaining({
      template, classification: "transactional", locale: "en",
      variables: expect.objectContaining({eventTitle: "AI Clinic"}),
    }));
    expect(send).toHaveBeenCalledTimes(1);
  });
});