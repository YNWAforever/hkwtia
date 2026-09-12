import {readFile} from "node:fs/promises";
import {resolve} from "node:path";

import {describe, expect, it, vi} from "vitest";

import {notificationActor} from "@/lib/db/repos/deliveries";
import type {RecipientFacts} from "@/lib/db/repos/message-eligibility";
import {
  dispatchNotification,
  type NotificationDispatchDependencies,
  type NotificationRequest,
} from "@/lib/notifications/dispatch";

const actor = notificationActor("campaign");
const PROFILE_ID = "member-1";
const CONTACT_ID = "11111111-1111-4111-8111-111111111111";

function memberFacts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    kind: "member",
    id: PROFILE_ID,
    displayName: "Ada Chan",
    email: "ada@example.test",
    whatsappNumber: "+85291234567",
    locale: "en",
    membershipStatus: "active",
    planCode: "community",
    renewalAt: null,
    marketingConsent: true,
    whatsappOptIn: true,
    whatsappOptedOutAt: null,
    emailSuppressed: false,
    whatsappSuppressed: false,
    ...overrides,
  };
}

function contactFacts(overrides: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    ...memberFacts(),
    kind: "contact",
    id: CONTACT_ID,
    marketingConsent: false,
    ...overrides,
  };
}

type Harness = Readonly<{
  dependencies: NotificationDispatchDependencies;
  factsFor: ReturnType<typeof vi.fn>;
  reserveEmail: ReturnType<typeof vi.fn>;
  reserveWhatsapp: ReturnType<typeof vi.fn>;
  retryEmailFailure: ReturnType<typeof vi.fn>;
  retryWhatsappFailure: ReturnType<typeof vi.fn>;
  completeEmail: ReturnType<typeof vi.fn>;
  completeWhatsapp: ReturnType<typeof vi.fn>;
  approved: ReturnType<typeof vi.fn>;
  emailSend: ReturnType<typeof vi.fn>;
  sendTemplateMessage: ReturnType<typeof vi.fn>;
  renderEmail: ReturnType<typeof vi.fn>;
  unsubscribeUrls: ReturnType<typeof vi.fn>;
}>;

type HarnessOptions = Readonly<{
  facts?: RecipientFacts | null;
  reservation?: unknown;
  approvedKeys?: readonly string[];
  registryEmpty?: boolean;
  emailSend?: ReturnType<typeof vi.fn>;
  sendTemplateMessage?: ReturnType<typeof vi.fn>;
}>;

function reservation(overrides: Record<string, unknown> = {}) {
  return {
    disposition: "created",
    record: {
      id: "delivery-1",
      status: "processing",
      providerId: null,
      errorCode: null,
      attemptCount: 1,
      ...overrides,
    },
  };
}

function harness(options: HarnessOptions = {}): Harness {
  const facts = options.facts === undefined ? memberFacts() : options.facts;
  const factsFor = vi.fn(async () => facts);
  const reserved = options.reservation ?? reservation();
  const reserveEmail = vi.fn(async () => reserved);
  const reserveWhatsapp = vi.fn(async () => reserved);
  const retryEmailFailure = vi.fn(async () => ({
    record: {id: "delivery-1", status: "processing", providerId: null, errorCode: null, attemptCount: 2},
    failureCode: "retryable_network",
  }));
  const retryWhatsappFailure = vi.fn(async () => ({
    record: {id: "delivery-1", status: "processing", providerId: null, errorCode: null, attemptCount: 2},
    failureCode: "retryable_network",
  }));
  const completeEmail = vi.fn(async () => ({id: "delivery-1"}));
  const completeWhatsapp = vi.fn(async () => ({id: "delivery-1"}));
  const approved = vi.fn(async () => ({
    keys: new Set(options.approvedKeys ?? ["wtia_announcement_en"]),
    empty: options.registryEmpty ?? false,
  }));
  const emailSend = options.emailSend
    ?? vi.fn(async () => ({status: "sent", providerId: "resend-1"}));
  const sendTemplateMessage = options.sendTemplateMessage
    ?? vi.fn(async () => ({status: "sent", providerId: "woztell-1"}));
  const renderEmail = vi.fn(async () => ({
    subject: "Rendered subject",
    html: "<p>hi</p>",
    text: "hi",
    headers: {},
  }));
  const unsubscribeUrls = vi.fn(() => ({
    pageUrl: "https://hkwtia.test/unsubscribe?token=t",
    oneClickUrl: "https://hkwtia.test/api/unsubscribe?token=t",
  }));
  return {
    factsFor,
    reserveEmail,
    reserveWhatsapp,
    retryEmailFailure,
    retryWhatsappFailure,
    completeEmail,
    completeWhatsapp,
    approved,
    emailSend,
    sendTemplateMessage,
    renderEmail,
    unsubscribeUrls,
    dependencies: {
      eligibility: {factsFor} as never,
      deliveries: {
        reserveEmail,
        reserveWhatsapp,
        retryEmailFailure,
        retryWhatsappFailure,
        completeEmail,
        completeWhatsapp,
      } as never,
      templates: {approved} as never,
      emailTransport: {send: emailSend} as never,
      whatsappTransport: {sendTemplateMessage} as never,
      renderEmail: renderEmail as never,
      unsubscribeUrls: unsubscribeUrls as never,
      emailFrom: "WTIA <hello@hkwtia.test>",
    },
  };
}

const whatsappRequest: NotificationRequest = {
  recipient: {kind: "member", profileId: PROFILE_ID},
  channel: "whatsapp",
  template: "wtia_announcement_en",
  variables: {memberName: "Ada", headline: "Spring mixer", detailUrl: "https://hkwtia.test/events"},
  idempotencyKey: "notify:campaign:campaign-1:recipient-1",
};

const emailRequest: NotificationRequest = {
  recipient: {kind: "member", profileId: PROFILE_ID},
  channel: "email",
  template: "campaign_generic",
  variables: {displayName: "Ada", ctaUrl: "https://hkwtia.test/portal"},
  idempotencyKey: "notify:campaign:campaign-1:recipient-2",
};

describe("notification dispatcher — consent", () => {
  it.each([
    ["a member suppression", memberFacts({whatsappSuppressed: true})],
    ["a prospect's recorded STOP", contactFacts({whatsappOptedOutAt: new Date("2026-09-01T00:00:00.000Z")})],
  ])("skips %s with no transport call and no log row", async (_label, facts) => {
    const test = harness({facts});
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({status: "skipped", reason: "suppressed"});
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
    expect(test.reserveWhatsapp).not.toHaveBeenCalled();
  });

  it("skips an email send to a member who is suppressed on email", async () => {
    const test = harness({facts: memberFacts({emailSuppressed: true})});
    const result = await dispatchNotification(actor, emailRequest, test.dependencies);

    expect(result).toEqual({status: "skipped", reason: "suppressed"});
    expect(test.emailSend).not.toHaveBeenCalled();
    expect(test.reserveEmail).not.toHaveBeenCalled();
  });

  it("skips a recipient the facts loader cannot find", async () => {
    const test = harness({facts: null});
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({status: "skipped", reason: "unknown_recipient"});
    expect(test.reserveWhatsapp).not.toHaveBeenCalled();
  });

  it("asks the facts loader for the identity the request names", async () => {
    const test = harness({facts: contactFacts({whatsappOptIn: true})});
    await dispatchNotification(actor, {
      ...whatsappRequest,
      recipient: {kind: "contact", contactId: CONTACT_ID},
    }, test.dependencies);

    expect(test.factsFor).toHaveBeenCalledWith(actor, {kind: "contact", contactId: CONTACT_ID});
  });
});

describe("notification dispatcher — the approved-template gate", () => {
  it("does not read the registry off the live switch", async () => {
    const test = harness();
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({status: "sent", providerId: "woztell-1", deliveryId: "delivery-1"});
    expect(test.approved).not.toHaveBeenCalled();
  });

  it("skips an unapproved template in live mode, before any reservation", async () => {
    vi.stubEnv("RUN_LIVE_WOZTELL", "1");
    const test = harness({approvedKeys: ["wtia_announcement_zh_hk"]});
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({status: "skipped", reason: "template_not_approved"});
    expect(test.reserveWhatsapp).not.toHaveBeenCalled();
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("refuses a template whose body parameters would go out empty", async () => {
    const test = harness();
    const result = await dispatchNotification(actor, {
      ...whatsappRequest,
      variables: {memberName: "Ada", headline: "  ", detailUrl: "https://hkwtia.test/events"},
    }, test.dependencies);

    expect(result).toEqual({status: "skipped", reason: "missing_variable"});
    expect(test.reserveWhatsapp).not.toHaveBeenCalled();
  });
});

describe("notification dispatcher — classification", () => {
  it("derives the classification from the template", async () => {
    const test = harness();
    await dispatchNotification(actor, emailRequest, test.dependencies);

    expect(test.reserveEmail.mock.calls[0]?.[1]).toMatchObject({
      classification: "marketing",
      template: "campaign_generic",
      profileId: PROFILE_ID,
      contactId: null,
      journeyStateId: null,
      subject: "Rendered subject",
    });
  });

  it("derives a transactional classification for a transactional template", async () => {
    const test = harness();
    await dispatchNotification(actor, {...emailRequest, template: "welcome"}, test.dependencies);

    expect(test.reserveEmail.mock.calls[0]?.[1]).toMatchObject({classification: "transactional"});
  });

  it("derives a WhatsApp classification from the template's Meta category", async () => {
    const test = harness();
    await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(test.reserveWhatsapp.mock.calls[0]?.[1]).toMatchObject({classification: "marketing"});

    const utility = harness();
    await dispatchNotification(actor, {
      ...whatsappRequest,
      template: "concierge_follow_up_en",
      variables: {memberName: "Ada", supportUrl: "https://hkwtia.test/help"},
    }, utility.dependencies);

    expect(utility.reserveWhatsapp.mock.calls[0]?.[1]).toMatchObject({classification: "transactional"});
  });

  it("refuses a caller-supplied classification", async () => {
    const test = harness();
    await expect(dispatchNotification(
      actor,
      {...emailRequest, classification: "transactional"} as never,
      test.dependencies,
    )).rejects.toThrow("INVALID_NOTIFICATION_REQUEST");
    expect(test.reserveEmail).not.toHaveBeenCalled();
  });

  it("refuses an idempotency key minted in the journey namespace", async () => {
    const test = harness();
    await expect(dispatchNotification(
      actor,
      {...whatsappRequest, idempotencyKey: "journey:renewal:member-1:d14:whatsapp"},
      test.dependencies,
    )).rejects.toThrow("INVALID_NOTIFICATION_REQUEST");
    expect(test.reserveWhatsapp).not.toHaveBeenCalled();
  });

  it("threads the unsubscribe URLs of a marketing email through the renderer", async () => {
    const test = harness();
    await dispatchNotification(actor, emailRequest, test.dependencies);

    expect(test.unsubscribeUrls).toHaveBeenCalledWith(PROFILE_ID, "en", expect.any(Date));
    expect(test.renderEmail.mock.calls[0]?.[0]).toMatchObject({
      unsubscribeUrl: "https://hkwtia.test/unsubscribe?token=t",
      unsubscribeOneClickUrl: "https://hkwtia.test/api/unsubscribe?token=t",
      recipientName: "Ada Chan",
    });
  });
});

describe("notification dispatcher — reservation dispositions", () => {
  it("returns the first result for a reservation already sent, without a second send", async () => {
    const test = harness({
      reservation: reservation({status: "sent", providerId: "woztell-first"}),
    });
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({status: "sent", providerId: "woztell-first", deliveryId: "delivery-1"});
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
    expect(test.completeWhatsapp).not.toHaveBeenCalled();
  });

  it("treats a resumed lease over a processing reservation as terminal, never a second send", async () => {
    const test = harness({
      reservation: {disposition: "existing", record: {id: "delivery-1", status: "processing", providerId: null, errorCode: null, attemptCount: 1}},
    });
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({
      status: "failed",
      errorCode: "provider_acceptance_uncertain",
      deliveryId: "delivery-1",
    });
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("retries a reservation the previous attempt left failed", async () => {
    const test = harness({
      reservation: {disposition: "existing", record: {id: "delivery-1", status: "failed", providerId: null, errorCode: "retryable_network", attemptCount: 1}},
    });
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(test.retryWhatsappFailure).toHaveBeenCalledWith(actor, "delivery-1", "retryable_network");
    expect(test.sendTemplateMessage).toHaveBeenCalledTimes(1);
    expect(result).toEqual({status: "sent", providerId: "woztell-1", deliveryId: "delivery-1"});
  });

  it("never retries a reservation whose recorded failure was an uncertain acceptance", async () => {
    const test = harness({
      reservation: {disposition: "existing", record: {id: "delivery-1", status: "failed", providerId: null, errorCode: "provider_acceptance_uncertain", attemptCount: 1}},
    });
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(result).toEqual({
      status: "failed",
      errorCode: "provider_acceptance_uncertain",
      deliveryId: "delivery-1",
    });
    expect(test.retryWhatsappFailure).not.toHaveBeenCalled();
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("sends a freshly created reservation and settles it", async () => {
    const test = harness();
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(test.sendTemplateMessage).toHaveBeenCalledWith({
      whatsappOptIn: true,
      whatsappNumber: "+85291234567",
      template: "wtia_announcement_en",
      variables: whatsappRequest.variables,
      idempotencyKey: whatsappRequest.idempotencyKey,
    });
    expect(test.completeWhatsapp).toHaveBeenCalledWith(actor, "delivery-1", {
      status: "sent",
      providerId: "woztell-1",
    });
    expect(result).toEqual({status: "sent", providerId: "woztell-1", deliveryId: "delivery-1"});
  });
});

describe("notification dispatcher — provider failures", () => {
  it("records an uncertain acceptance as a failure the caller must not reschedule", async () => {
    const sendTemplateMessage = vi.fn(async () => {
      throw Object.assign(new Error("WHATSAPP_DELIVERY_FAILED"), {code: "provider_acceptance_uncertain"});
    });
    const test = harness({sendTemplateMessage});
    const result = await dispatchNotification(actor, whatsappRequest, test.dependencies);

    expect(test.completeWhatsapp).toHaveBeenCalledWith(actor, "delivery-1", {
      status: "failed",
      errorCode: "provider_acceptance_uncertain",
    });
    expect(result).toEqual({
      status: "failed",
      errorCode: "provider_acceptance_uncertain",
      deliveryId: "delivery-1",
    });
  });

  it("records an email provider failure against the reserved row", async () => {
    const emailSend = vi.fn(async () => {
      throw Object.assign(new Error("EMAIL_DELIVERY_FAILED"), {code: "retryable_rate_limit"});
    });
    const test = harness({emailSend});
    const result = await dispatchNotification(actor, emailRequest, test.dependencies);

    expect(test.completeEmail).toHaveBeenCalledWith(actor, "delivery-1", {
      status: "failed",
      errorCode: "retryable_rate_limit",
    });
    expect(result).toEqual({
      status: "failed",
      errorCode: "retryable_rate_limit",
      deliveryId: "delivery-1",
    });
  });

  it("raises a retryable failure when the ledger cannot be written", async () => {
    const test = harness();
    test.reserveWhatsapp.mockRejectedValueOnce(new Error("connection terminated"));

    await expect(dispatchNotification(actor, whatsappRequest, test.dependencies))
      .rejects.toMatchObject({code: "retryable_network"});
    expect(test.sendTemplateMessage).not.toHaveBeenCalled();
  });
});

describe("notification dispatcher — boundaries", () => {
  const source = readFile(resolve(process.cwd(), "lib/notifications/dispatch.ts"), "utf8");

  function importsDatabaseDirectly(text: string): boolean {
    return /["']@\/lib\/db\/(?:client|repos\/common)["']/.test(text);
  }

  it("detects the shapes it is meant to catch", () => {
    expect(importsDatabaseDirectly(`import {getDb} from "@/lib/db/repos/common";`)).toBe(true);
    expect(importsDatabaseDirectly(`import {db} from '@/lib/db/client';`)).toBe(true);
    expect(importsDatabaseDirectly(`import {deliveriesRepository} from "@/lib/db/repos/deliveries";`)).toBe(false);
  });

  it("orchestrates repositories and never opens a database of its own", async () => {
    expect(importsDatabaseDirectly(await source)).toBe(false);
  });

  it("is a plain server-only module, not a server-action boundary", async () => {
    const text = await source;
    expect(text).toContain(`import "server-only"`);
    expect(text).not.toContain(`"use server"`);
  });
});
