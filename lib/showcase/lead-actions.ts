import "server-only";

import {randomUUID} from "node:crypto";
import {z} from "zod";

import {renderEmail, type RenderEmailInput, type RenderedEmail} from "@/lib/email/render";
import {createConfiguredEmailTransport, type EmailTransport} from "@/lib/email/transport";
import {serverEnv} from "@/lib/config/env";
import {showcaseRepository, type ShowcaseRepository} from "@/lib/db/repos/showcase";
import type {NewLead} from "@/lib/db/server-schema";
import {createInMemoryRateLimiter, type RateLimiter} from "@/lib/security/rate-limit";
import type {AppLocale} from "@/i18n/routing";
import {localizedPath} from "@/lib/urls";

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
  createLead: (input: NewLead) => Promise<unknown | null>;
}>;
type LeadEmailRenderer = (input: RenderEmailInput) => Promise<RenderedEmail>;

export type LeadRequestResult = Readonly<
  | {ok: true}
  | {ok: false; code: "invalid" | "rate_limited"}
>;

export type LeadServiceDependencies = Readonly<{
  repository: LeadRepository | Pick<ShowcaseRepository, "getPublishedBySlug" | "createLead">;
  limiter: RateLimiter;
  emailTransport: EmailTransport;
  renderEmail: LeadEmailRenderer;
  resolveStaffRecipient: () => Promise<string | null>;
  emailFrom: string;
  appUrl: string;
  rateLimitBucketMs?: number;
  now?: () => number;
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

function absoluteCtaUrl(appUrl: string, locale: AppLocale, path: string): string {
  return new URL(localizedPath(locale, path), appUrl).toString();
}

async function sendRenderedEmail(
  dependencies: LeadServiceDependencies,
  input: RenderEmailInput,
  recipient: string,
  from: string,
  idempotencyKey: string,
): Promise<void> {
  try {
    const rendered = await dependencies.renderEmail(input);
    await dependencies.emailTransport.send({
      to: recipient,
      from,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      headers: rendered.headers,
      idempotencyKey,
    });
  } catch {
    // The lead is already durable; delivery is retriable and must not expose provider details.
  }
}

export function createLeadService(dependencies: LeadServiceDependencies) {
  const now = dependencies.now ?? Date.now;
  const bucketMs = dependencies.rateLimitBucketMs ?? 15 * 60_000;

  return Object.freeze({
    async request(formData: FormData): Promise<LeadRequestResult> {
      if (textValue(formData, "website").trim().length > 0) return {ok: true};
      const parsed = parseFormData(formData);
      if (!parsed.success) return {ok: false, code: "invalid"};

      const listing = await dependencies.repository.getPublishedBySlug(parsed.data.slug);
      if (!listing) return {ok: false, code: "invalid"};

      const bucket = Math.floor(now() / bucketMs);
      const limiterKey = `showcase:${listing.slug}:${parsed.data.email}:${bucket}`;
      if (!dependencies.limiter.check(limiterKey).allowed) {
        return {ok: false, code: "rate_limited"};
      }

      const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();
      const lead = await dependencies.repository.createLead({
        listingId: listing.id,
        contactName: parsed.data.contactName,
        email: parsed.data.email,
        organization: parsed.data.organization || null,
        message: parsed.data.message || null,
        locale: parsed.data.locale,
        idempotencyKey,
      });
      if (!lead) return {ok: true};

      const locale = parsed.data.locale as AppLocale;
      const ctaUrl = absoluteCtaUrl(dependencies.appUrl, locale, `/showcase/${listing.slug}`);
      const ackInput: RenderEmailInput = {
        template: "lead_ack",
        locale,
        recipientName: parsed.data.contactName,
        variables: {ctaUrl},
      };
      await sendRenderedEmail(dependencies, ackInput, parsed.data.email, dependencies.emailFrom, `showcase-lead:${idempotencyKey}:ack`);

      const staffRecipient = await dependencies.resolveStaffRecipient().catch(() => null);
      if (staffRecipient) {
        const staffInput: RenderEmailInput = {
          template: "lead_staff_notify",
          locale,
          recipientName: listing.nameEn,
          variables: {ctaUrl},
        };
        await sendRenderedEmail(dependencies, staffInput, staffRecipient, dependencies.emailFrom, `showcase-lead:${idempotencyKey}:staff`);
      }

      return {ok: true};
    },
  });
}

const defaultRateLimiter = createInMemoryRateLimiter({limit: 3, windowMs: 15 * 60_000});

export async function requestIntroAction(formData: FormData): Promise<LeadRequestResult> {
  const environment = serverEnv();
  const service = createLeadService({
    repository: showcaseRepository,
    limiter: defaultRateLimiter,
    emailTransport: createConfiguredEmailTransport(environment),
    renderEmail,
    resolveStaffRecipient: async () => process.env.SHOWCASE_STAFF_EMAIL?.trim() || environment.emailFrom.trim() || null,
    emailFrom: environment.emailFrom,
    appUrl: environment.appUrl || "http://localhost:3000",
  });
  return service.request(formData);
}
