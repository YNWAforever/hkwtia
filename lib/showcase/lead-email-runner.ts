import "server-only";

import {automationCronActor} from "@/lib/auth/automation-actor";
import {appEnv, emailEnv} from "@/lib/config/env";
import {
  contactWriterActor,
  type ContactWriterActor,
} from "@/lib/db/repos/contacts";
import {
  showcaseLeadEmailOutboxRepository,
  type LeadEmailClaim,
} from "@/lib/db/repos/showcase-lead-email-outbox";
import type {ShowcaseLeadEmailPayload} from "@/lib/db/server-schema";
import {renderEmail, type RenderEmailInput, type RenderedEmail} from "@/lib/email/render";
import {
  createConfiguredEmailTransport,
  DeliveryFailure,
  type EmailTransport,
} from "@/lib/email/transport";
import {localizedPath} from "@/lib/urls";

type Outbox = typeof showcaseLeadEmailOutboxRepository;
export type LeadEmailRunnerDependencies = Readonly<{
  outbox: Pick<Outbox, "claimForLead" | "claimDue" | "loadContext" | "freezePayload" | "markSent" | "markRetryable" | "markBlocked">;
  renderEmail: (input: RenderEmailInput) => Promise<RenderedEmail>;
  transport: EmailTransport;
  resolveStaffRecipient: () => Promise<string | null>;
  emailFrom: string;
  appUrl: string;
}>;

type DeliveryActor = Parameters<Outbox["loadContext"]>[0];

function ctaUrl(appUrl: string, locale: "en" | "zh-HK", slug: string): string {
  return new URL(localizedPath(locale, `/showcase/${slug}`), appUrl).toString();
}

async function payloadFor(
  actor: DeliveryActor,
  claim: LeadEmailClaim,
  dependencies: LeadEmailRunnerDependencies,
): Promise<ShowcaseLeadEmailPayload | null> {
  const context = await dependencies.outbox.loadContext(actor, claim.leadId);
  const recipient = claim.kind === "ack"
    ? context.email
    : await dependencies.resolveStaffRecipient();
  if (!recipient) return null;
  const input: RenderEmailInput = {
    template: claim.kind === "ack" ? "lead_ack" : "lead_staff_notify",
    locale: context.locale,
    recipientName: claim.kind === "ack" ? context.contactName : context.listingNameEn,
    variables: {ctaUrl: ctaUrl(dependencies.appUrl, context.locale, context.listingSlug)},
  };
  const rendered = await dependencies.renderEmail(input);
  return {
    to: recipient,
    from: dependencies.emailFrom,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers: rendered.headers,
    idempotencyKey: claim.idempotencyKey,
  };
}

async function processClaims(
  actor: DeliveryActor,
  claims: readonly LeadEmailClaim[],
  dependencies: LeadEmailRunnerDependencies,
  now: Date,
): Promise<void> {
  for (const claim of claims) {
    let payload = claim.payload;
    if (!payload) {
      try {
        payload = await payloadFor(actor, claim, dependencies);
      } catch {
        await dependencies.outbox.markRetryable(actor, claim.id, claim.attemptCount, now, "render_failed");
        continue;
      }
      if (!payload) {
        await dependencies.outbox.markBlocked(actor, claim.id, claim.attemptCount, now, "staff_recipient_missing");
        continue;
      }
      const frozen = await dependencies.outbox.freezePayload(
        actor, claim.id, claim.attemptCount, payload, now,
      );
      if (!frozen) continue;
    }
    try {
      const result = await dependencies.transport.send(payload);
      const settled = await dependencies.outbox.markSent(actor, claim.id, claim.attemptCount, result.providerId);
      if (!settled) throw new Error("SHOWCASE_LEAD_EMAIL_SETTLEMENT_LOST");
    } catch (error) {
      if (error instanceof DeliveryFailure && error.code === "provider_client_error") {
        await dependencies.outbox.markBlocked(actor, claim.id, claim.attemptCount, now, error.code);
      } else {
        const code = error instanceof DeliveryFailure ? error.code : "delivery_unknown";
        await dependencies.outbox.markRetryable(actor, claim.id, claim.attemptCount, now, code);
      }
    }
  }
}

export async function deliverLeadEmailForLead(
  leadId: string,
  dependencies: LeadEmailRunnerDependencies,
  now = new Date(),
): Promise<void> {
  const actor: ContactWriterActor = contactWriterActor("showcase_intro");
  const claims = await dependencies.outbox.claimForLead(actor, leadId, now);
  await processClaims(actor, claims, dependencies, now);
}

export async function drainLeadEmailOutbox(
  now: Date,
  dependencies: LeadEmailRunnerDependencies,
): Promise<void> {
  const actor = automationCronActor();
  const claims = await dependencies.outbox.claimDue(actor, now, 20);
  await processClaims(actor, claims, dependencies, now);
}

export function productionLeadEmailDependencies(): LeadEmailRunnerDependencies {
  const environment = emailEnv();
  return {
    outbox: showcaseLeadEmailOutboxRepository,
    renderEmail,
    transport: createConfiguredEmailTransport(environment),
    resolveStaffRecipient: async () =>
      process.env.SHOWCASE_STAFF_EMAIL?.trim() || environment.emailFrom.trim() || null,
    emailFrom: environment.emailFrom,
    appUrl: appEnv().appUrl,
  };
}
