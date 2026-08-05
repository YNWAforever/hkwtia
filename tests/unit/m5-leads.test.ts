import {describe, expect, it, vi} from "vitest";

import {createInMemoryRateLimiter} from "@/lib/security/rate-limit";
import {createLeadService} from "@/lib/showcase/lead-actions";

const listing = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "harbour-vision-ai",
  nameEn: "Harbour Vision AI",
};

function form(overrides: Record<string, string> = {}): FormData {
  const value = new FormData();
  value.set("slug", "harbour-vision-ai");
  value.set("contactName", "Ada Lovelace");
  value.set("email", "ADA@EXAMPLE.COM");
  value.set("organization", "Analytical Engines");
  value.set("message", "Please introduce us.");
  value.set("locale", "en");
  value.set("idempotencyKey", "lead-1");
  for (const [key, item] of Object.entries(overrides)) value.set(key, item);
  return value;
}

function dependencies(overrides: Record<string, unknown> = {}) {
  const leads: unknown[] = [];
  const sends: unknown[] = [];
  return {
    service: createLeadService({
      repository: {
        getPublishedBySlug: vi.fn(async () => listing),
        createLead: vi.fn(async (input) => {
          leads.push(input);
          return {...input, id: `lead-${leads.length}`};
        }),
      },
      limiter: createInMemoryRateLimiter({limit: 1, windowMs: 60_000, now: () => 10_000}),
      emailTransport: {
        async send(input) {
          sends.push(input);
          return {status: "sent" as const, providerId: `provider-${sends.length}`};
        },
      },
      renderEmail: vi.fn(async ({template}: {template: string}) => ({
        subject: template,
        html: `<p>${template}</p>`,
        text: template,
        headers: {},
      })),
      resolveStaffRecipient: async () => "staff@example.com",
      emailFrom: "WTIA <notifications@example.com>",
      appUrl: "https://hkwtia.example",
      rateLimitBucketMs: 60_000,
      ...overrides,
    }),
    leads,
    sends,
  };
}

describe("showcase request-intro lead service", () => {
  it("creates one lead and sends acknowledgement plus staff notification", async () => {
    const fake = dependencies();

    await expect(fake.service.request(form())).resolves.toEqual({ok: true});
    expect(fake.leads).toHaveLength(1);
    expect(fake.leads[0]).toMatchObject({email: "ada@example.com", listingId: listing.id, locale: "en"});
    expect(fake.sends).toHaveLength(2);
    expect(fake.sends).toEqual(expect.arrayContaining([
      expect.objectContaining({to: "ada@example.com", idempotencyKey: "showcase-lead:lead-1:ack"}),
      expect.objectContaining({to: "staff@example.com", idempotencyKey: "showcase-lead:lead-1:staff"}),
    ]));
  });

  it("returns invalid before side effects for malformed input or missing listings", async () => {
    const fake = dependencies();

    await expect(fake.service.request(form({email: "not-an-email"}))).resolves.toEqual({ok: false, code: "invalid"});
    await expect(fake.service.request(form({contactName: ""}))).resolves.toEqual({ok: false, code: "invalid"});
    const missing = dependencies({
      repository: {getPublishedBySlug: vi.fn(async () => null), createLead: vi.fn()},
    });
    await expect(missing.service.request(form({idempotencyKey: "missing"}))).resolves.toEqual({ok: false, code: "invalid"});
    expect(fake.leads).toHaveLength(0);
    expect(fake.sends).toHaveLength(0);
  });

  it("short-circuits honeypot submissions without repository or email calls", async () => {
    const fake = dependencies();

    await expect(fake.service.request(form({website: "https://bot.invalid"}))).resolves.toEqual({ok: true});
    expect(fake.leads).toHaveLength(0);
    expect(fake.sends).toHaveLength(0);
  });

  it("rate limits repeated normalized email/listing requests", async () => {
    const fake = dependencies();

    await expect(fake.service.request(form({idempotencyKey: "first"}))).resolves.toEqual({ok: true});
    await expect(fake.service.request(form({idempotencyKey: "second"}))).resolves.toEqual({ok: false, code: "rate_limited"});
    expect(fake.leads).toHaveLength(1);
  });

  it("keeps a durable lead when delivery fails and ignores duplicate idempotency keys", async () => {
    const fake = dependencies({
      limiter: createInMemoryRateLimiter({limit: 2, windowMs: 60_000, now: () => 10_000}),
      emailTransport: {async send() {throw new Error("provider down");}},
      repository: {
        getPublishedBySlug: vi.fn(async () => listing),
        createLead: vi.fn(async (input) => input.idempotencyKey === "duplicate" && fake.leads.length > 0
          ? null
          : (fake.leads.push(input), input)),
      },
    });

    await expect(fake.service.request(form({idempotencyKey: "duplicate"}))).resolves.toEqual({ok: true});
    await expect(fake.service.request(form({idempotencyKey: "duplicate", email: "other@example.com"}))).resolves.toEqual({ok: true});
    expect(fake.leads).toHaveLength(1);
  });
});
