import {describe, expect, it, vi} from "vitest";

import {createInterestService} from "@/lib/growth/interest-service";
import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";

function form(overrides: Record<string, string> = {}): FormData {
  const value = new FormData();
  value.set("email", "ADA@example.hk");
  value.set("displayName", "Ada");
  value.set("locale", "en");
  value.set("whatsappNumber", "+852 9123 4567");
  value.set("whatsappOptIn", "on");
  for (const [key, item] of Object.entries(overrides)) value.set(key, item);
  return value;
}

function service() {
  const upsert = vi.fn(async () => ({id: "c-1", disposition: "upserted" as const}));
  return {
    upsert,
    service: createInterestService({
      contacts: {upsertFromInterestForm: upsert},
      limiter: createInMemoryRateLimiter({limit: 1, windowMs: 60_000, now: () => 10_000}),
      resolveClientIp: async () => "203.0.113.10",
    }),
  };
}

describe("interest service", () => {
  it("stores a normalised contact with WhatsApp consent", async () => {
    const {service: subject, upsert} = service();
    await expect(subject.submit(form())).resolves.toEqual({ok: true});
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({kind: "contact-writer", source: "interest_form"}), {
      email: "ADA@example.hk", displayName: "Ada", locale: "en", whatsappNumber: "+85291234567", whatsappOptIn: true,
    });
  });

  it("silently accepts honeypot submissions without writing", async () => {
    const {service: subject, upsert} = service();
    await expect(subject.submit(form({website: "http://spam"}))).resolves.toEqual({ok: true});
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects opt-in without a number and rate-limits by ip", async () => {
    const {service: subject} = service();
    await expect(subject.submit(form({whatsappNumber: ""}))).resolves.toEqual({ok: false, code: "invalid"});
    await expect(subject.submit(form())).resolves.toEqual({ok: true});
    await expect(subject.submit(form())).resolves.toEqual({ok: false, code: "rate_limited"});
  });
});
