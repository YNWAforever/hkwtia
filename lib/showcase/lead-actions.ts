import "server-only";

import {randomUUID} from "node:crypto";
import {z} from "zod";

import type {ShowcaseRepository} from "@/lib/db/repos/showcase";
import {contactWriterActor, type ContactWriterActor} from "@/lib/db/repos/contacts";
import type {NewLead} from "@/lib/db/server-schema";
import type {RateLimiter} from "@/lib/security/rate-limit";

const leadInputSchema = z.object({
  slug: z.string().trim().min(2).max(96).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  contactName: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  organization: z.string().trim().max(200),
  message: z.string().trim().max(4_000),
  locale: z.enum(["en", "zh-HK"]),
  website: z.string().trim(),
  idempotencyKey: z.string().trim().min(1).max(200).optional(),
});

type LeadListing = Readonly<{id: string; slug: string; nameEn: string}>;
type LeadRepository = Readonly<{
  getPublishedBySlug: (slug: string) => Promise<LeadListing | null>;
  createLead: (actor: ContactWriterActor, input: NewLead) => Promise<{id: string} | null>;
}>;

export type LeadRequestResult = Readonly<
  | {ok: true}
  | {ok: false; code: "invalid" | "rate_limited"}
>;

export type LeadServiceDependencies = Readonly<{
  repository: LeadRepository | Pick<ShowcaseRepository, "getPublishedBySlug" | "createLead">;
  limiter: RateLimiter;
  deliverLeadEmails: (leadId: string) => Promise<void>;
  /** Injected so the service stays testable outside a request scope. */
  resolveClientIp: () => Promise<string | null>;
}>;

function textValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function parseFormData(formData: FormData) {
  return leadInputSchema.safeParse({
    slug: textValue(formData, "slug"),
    contactName: textValue(formData, "contactName"),
    email: textValue(formData, "email"),
    organization: textValue(formData, "organization"),
    message: textValue(formData, "message"),
    locale: textValue(formData, "locale"),
    website: textValue(formData, "website"),
    idempotencyKey: textValue(formData, "idempotencyKey") || undefined,
  });
}

export function createLeadService(dependencies: LeadServiceDependencies) {
  return Object.freeze({
    async request(formData: FormData): Promise<LeadRequestResult> {
      if (textValue(formData, "website").trim().length > 0) return {ok: true};
      const parsed = parseFormData(formData);
      if (!parsed.success) return {ok: false, code: "invalid"};

      // Key on the client rather than the submitted email: the email is
      // attacker-chosen, so an email-keyed quota is bypassed by varying it.
      // The platform sets the trusted proxy header and a client cannot strip
      // it, so there is no downgrade path. Where no such header exists at all,
      // fall back to the email key rather than collapsing every visitor into a
      // single bucket, which would take the form offline site-wide after three
      // submissions.
      const clientIp = await dependencies.resolveClientIp();
      const limiterKey = clientIp
        ? `showcase-lead:ip:${clientIp}`
        : `showcase-lead:email:${parsed.data.slug}:${parsed.data.email}`;
      if (!dependencies.limiter.check(limiterKey).allowed) {
        return {ok: false, code: "rate_limited"};
      }

      // Checked after the limiter so unauthenticated traffic cannot spend a
      // database query per request.
      const listing = await dependencies.repository.getPublishedBySlug(parsed.data.slug);
      if (!listing) return {ok: false, code: "invalid"};

      const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();
      const lead = await dependencies.repository.createLead(contactWriterActor("showcase_intro"), {
        listingId: listing.id,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        organization: parsed.data.organization || null,
        message: parsed.data.message || null,
        locale: parsed.data.locale,
        idempotencyKey,
      });
      if (!lead) return {ok: true};

      try {
        await dependencies.deliverLeadEmails(lead.id);
      } catch {
        // The transaction already enqueued both notices; cron recovers this claim.
      }

      return {ok: true};
    },
  });
}

export type LeadService = ReturnType<typeof createLeadService>;
