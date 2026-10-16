import {describe, expect, it, vi} from "vitest";

import {contactWriterActor} from "@/lib/db/repos/contacts";
import {createShowcaseRepository, type ShowcaseStore} from "@/lib/db/repos/showcase";

const lead = {
  listingId: "11111111-1111-4111-8111-111111111111",
  contactName: "Ada Lovelace", email: "ada@example.com",
  organization: null, message: null, locale: "en", idempotencyKey: "lead-1",
} as const;

describe("showcase lead writer boundary", () => {
  it("rejects anonymous and forged contact writers before touching the store", async () => {
    const insertLead = vi.fn(async () => null);
    const repository = createShowcaseRepository({store: {insertLead} as unknown as ShowcaseStore});
    await expect(repository.createLead({kind: "anonymous", userId: null} as never, lead))
      .rejects.toThrow("FORBIDDEN");
    await expect(repository.createLead({kind: "contact-writer", userId: null, source: "showcase_intro"} as never, lead))
      .rejects.toThrow("FORBIDDEN");
    expect(insertLead).not.toHaveBeenCalled();
  });

  it("accepts only the showcase-intro capability", async () => {
    const insertLead = vi.fn(async () => null);
    const repository = createShowcaseRepository({store: {insertLead} as unknown as ShowcaseStore});
    await expect(repository.createLead(contactWriterActor("event_guest"), lead))
      .rejects.toThrow("FORBIDDEN");
    await expect(repository.createLead(contactWriterActor("showcase_intro"), lead))
      .resolves.toBeNull();
    expect(insertLead).toHaveBeenCalledOnce();
  });
});
