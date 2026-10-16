import {beforeEach, describe, expect, it, vi} from "vitest";

const {appEnv, emailEnv, unsubscribeEnv, createTransport, register, headers} = vi.hoisted(() => ({
  appEnv: vi.fn(() => ({appUrl: "https://hkwtia.example"})),
  emailEnv: vi.fn(() => ({emailFrom: "events@hkwtia.example"})),
  unsubscribeEnv: vi.fn(() => ({unsubscribeTokenSecret: "s".repeat(32)})),
  createTransport: vi.fn(() => ({send: vi.fn(async () => undefined)})),
  register: vi.fn(),
  headers: vi.fn(async () => new Headers({"x-forwarded-for": "203.0.113.21"})),
}));

vi.mock("next/headers", () => ({headers}));
vi.mock("@/lib/config/env", () => ({appEnv, emailEnv, unsubscribeEnv}));
vi.mock("@/lib/email/transport", () => ({createConfiguredEmailTransport: createTransport}));
vi.mock("@/lib/db/repos/event-guests", () => ({eventGuestsRepository: {register}}));
vi.mock("@/lib/db/repos/contacts", () => ({
  contactWriterActor: (source: string) => ({kind: "contact-writer", source}),
  contactsRepository: {upsertFromInterestForm: vi.fn()},
}));
vi.mock("@/lib/email/render", () => ({renderEmail: vi.fn()}));

import {submitGuestRsvpAction} from "@/lib/events/guest-registration-action";

const EVENT = "22222222-2222-4222-8222-222222222222";

function form(values: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("eventId", EVENT);
  data.set("locale", "en");
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

describe("guest RSVP recovery boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns field errors for an empty form before initializing dependencies", async () => {
    const result = await submitGuestRsvpAction(form());
    expect(result).toMatchObject({ok: false, code: "invalid", fieldErrors: {name: "required", email: "required"}});
    expect(appEnv).not.toHaveBeenCalled();
    expect(emailEnv).not.toHaveBeenCalled();
    expect(unsubscribeEnv).not.toHaveBeenCalled();
    expect(createTransport).not.toHaveBeenCalled();
    expect(headers).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("rejects invalid email and phone without registration or transport", async () => {
    const result = await submitGuestRsvpAction(form({name: "Ada", email: "invalid", whatsappNumber: "12"}));
    expect(result).toMatchObject({ok: false, code: "invalid", fieldErrors: {email: "invalid", whatsappNumber: "invalid"}});
    expect(createTransport).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });

  it("returns a redacted recovery ID when required configuration cannot initialize", async () => {
    appEnv.mockImplementationOnce(() => { throw new Error("SECRET_TOKEN=do-not-return"); });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const result = await submitGuestRsvpAction(form({name: "Ada", email: "ada@example.test"}));
      expect(result).toMatchObject({ok: false, code: "unavailable", errorId: expect.any(String)});
      expect(JSON.stringify(result)).not.toContain("SECRET_TOKEN");
      expect(log).toHaveBeenCalledWith("guest-rsvp-init", expect.any(String), expect.any(String));
      expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET_TOKEN");
      expect(register).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
});
