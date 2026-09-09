import {describe, expect, it, vi} from "vitest";

import type {GuestRegistrationResult} from "@/lib/db/repos/event-guests";
import {cancelTokenDigest, createGuestRegistrationService} from "@/lib/events/guest-registration-core";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";

const EVENT = "22222222-2222-4222-8222-222222222222";

function form(overrides: Record<string, string> = {}): FormData {
  const data = new FormData();
  data.set("eventId", EVENT); data.set("name", "Ada"); data.set("email", "ADA@example.hk"); data.set("locale", "en");
  data.set("whatsappNumber", "+852 9123 4567"); data.set("organisation", "Acme"); data.set("marketingConsent", "on");
  for (const [key, value] of Object.entries(overrides)) data.set(key, value);
  return data;
}

function service() {
  const register = vi.fn(async (): Promise<GuestRegistrationResult> => ({id: "g1", disposition: "registered", eventTitle: "AI Clinic", slug: "ai-clinic"}));
  const upsertContact = vi.fn(async () => ({id: "c1", disposition: "upserted" as const}));
  const send = vi.fn(async () => undefined);
  const subject = createGuestRegistrationService({
    guests: {register}, contacts: {upsertFromInterestForm: upsertContact},
    limiter: createInMemoryRateLimiter({limit: 1, windowMs: 60_000, now: () => 1}),
    resolveClientIp: async () => "203.0.113.9", sendConfirmation: send,
    secret: "s".repeat(32), appUrl: "https://hkwtia.example",
  });
  return {subject, register, upsertContact, send};
}

describe("guest registration service (programme B-4)", () => {
  it("honeypot short-circuits; valid input registers, upserts a contact and sends one confirmation", async () => {
    const {subject, register, upsertContact, send} = service();
    await expect(subject.submit(form({website: "spam"}))).resolves.toEqual({ok: true, disposition: "registered"});
    expect(register).not.toHaveBeenCalled();

    await expect(subject.submit(form())).resolves.toEqual({ok: true, disposition: "registered"});
    expect(register).toHaveBeenCalledWith(
      expect.objectContaining({kind: "contact-writer", source: "event_guest"}),
      expect.objectContaining({eventId: EVENT, email: "ada@example.hk", whatsappNumber: "+85291234567", organisation: "Acme", marketingConsent: true, locale: "en"}),
    );
    expect(upsertContact).toHaveBeenCalledWith(
      expect.objectContaining({source: "event_guest"}),
      expect.objectContaining({email: "ada@example.hk", displayName: "Ada", whatsappNumber: "+85291234567", whatsappOptIn: true, consentSource: "rsvp"}),
    );
    expect(send).toHaveBeenCalledTimes(1);
    const [payload] = send.mock.calls[0] as unknown as [{to: string; eventTitle: string; slug: string; cancelUrl: string; registrationId: string; cancelTokenDigest: string}];
    // The slug comes from the repository's locked row, never from the form.
    expect(payload).toEqual(expect.objectContaining({to: "ada@example.hk", eventTitle: "AI Clinic", slug: "ai-clinic", disposition: "registered", registrationId: "g1"}));
    expect(payload.cancelUrl).toMatch(/^https:\/\/hkwtia\.example\/api\/events\/guest\/cancel\?token=[0-9a-f]{32}$/);
    // The repository only ever saw the digest of the token in the link, never the token itself.
    const token = new URL(payload.cancelUrl).searchParams.get("token") ?? "";
    const [, registered] = register.mock.calls[0] as unknown as [unknown, {cancelTokenDigest: string}];
    expect(registered.cancelTokenDigest).toBe(cancelTokenDigest("s".repeat(32), token));
    expect(registered.cancelTokenDigest).not.toContain(token);
    expect(payload.cancelTokenDigest).toBe(registered.cancelTokenDigest);
  });

  it("rejects invalid input and rate-limits the client", async () => {
    const {subject, register} = service();
    await expect(subject.submit(form({email: "nope"}))).resolves.toEqual({ok: false, code: "invalid"});
    await expect(subject.submit(form({whatsappNumber: "12"}))).resolves.toEqual({ok: false, code: "invalid"});
    expect(register).not.toHaveBeenCalled();
    await subject.submit(form());
    await expect(subject.submit(form({email: "other@example.hk"}))).resolves.toEqual({ok: false, code: "rate_limited"});
    expect(register).toHaveBeenCalledTimes(1);
  });

  it("maps repository refusals to codes", async () => {
    const {subject, register, send} = service();
    register.mockRejectedValueOnce(new Error("EVENT_REGISTRATION_CLOSED"));
    await expect(subject.submit(form())).resolves.toEqual({ok: false, code: "closed"});
    expect(send).not.toHaveBeenCalled();
  });

  it("does not re-send a confirmation to an already registered guest, and survives a contact failure", async () => {
    const {subject, register, upsertContact, send} = service();
    register.mockResolvedValueOnce({id: "g1", disposition: "already_registered", eventTitle: "AI Clinic", slug: "ai-clinic"});
    upsertContact.mockRejectedValueOnce(new Error("CONTACT_UPSERT_FAILED"));
    await expect(subject.submit(form())).resolves.toEqual({ok: true, disposition: "already_registered"});
    expect(send).not.toHaveBeenCalled();
  });

  it("returns unavailable instead of throwing when the repository fails unexpectedly", async () => {
    const {subject, register, send} = service();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    register.mockRejectedValueOnce(new Error("connection reset"));
    await expect(subject.submit(form())).resolves.toEqual({ok: false, code: "unavailable"});
    expect(send).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith("guest-rsvp", expect.any(Error));
    error.mockRestore();
  });
});
