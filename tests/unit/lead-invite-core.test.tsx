import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {afterEach, describe, expect, it, vi} from "vitest";

import {
  createLeadInvite,
  sendLeadInviteEmail,
  whatsappInviteHref,
  type LeadInviteDependencies,
} from "@/lib/admin/lead-invite-core";
import {renderEmail} from "@/lib/email/render";
import {DeliveryFailure, type EmailSendInput} from "@/lib/email/transport";
import {ANONYMOUS_ACTOR} from "@/lib/membership/lifecycle";
import en from "@/messages/en.json";
import zh from "@/messages/zh-HK.json";

/**
 * Phase E, Task 5. Staff create a personal join link on the lead page and send
 * it. The raw link exists only in the value these functions return: it is never
 * written to the timeline, the audit log or the console.
 */
const admin = {kind: "staff", userId: "staff-a", profileId: "staff-a", role: "superadmin"} as const;
const contactId = "11111111-1111-4111-8111-111111111111";
const inviteId = "22222222-2222-4222-8222-222222222222";
const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345678901234";

process.env.NEXT_PUBLIC_SITE_URL = "https://wtia.example.test";

function harness(locale: "en" | "zh-HK" = "en", overrides: Partial<{email: string | null; staffEmail: string | null; failWith: DeliveryFailure; latestState: string | null; tokenMatches: boolean}> = {}) {
  const sent: EmailSendInput[] = [];
  const recorded: unknown[] = [];
  const deps: LeadInviteDependencies = {
    invites: {
      create: vi.fn(async () => ({invite: {id: inviteId} as never, token: TOKEN})),
      latestForContact: vi.fn(async () => (overrides.latestState ? {id: inviteId, state: overrides.latestState} as never : null)),
      tokenBelongsTo: vi.fn(async () => overrides.tokenMatches ?? true),
    },
    contacts: {
      get: vi.fn(async () => ({id: contactId, displayName: "Ada Wong", email: "email" in overrides ? overrides.email : "ada@example.hk"}) as never),
      localeOf: vi.fn(async () => locale),
    },
    activities: {recordInviteSent: vi.fn(async (_actor, input) => { recorded.push(input); })},
    staffEmail: vi.fn(async () => ("staffEmail" in overrides ? overrides.staffEmail! : "sam@wtia.example.test")),
    transport: () => ({
      async send(input) {
        if (overrides.failWith) throw overrides.failWith;
        sent.push(input);
        return {status: "sent", providerId: "p1"};
      },
    }),
    emailFrom: () => "WTIA <hello@wtia.example.test>",
    render: renderEmail,
  };
  return {deps, sent, recorded};
}

describe("createLeadInvite", () => {
  it("returns an unprefixed absolute link for an English contact", async () => {
    const {deps} = harness("en");
    await expect(createLeadInvite(admin, contactId, "community", deps)).resolves.toEqual({
      url: `https://wtia.example.test/join/invite/${TOKEN}`, inviteId,
    });
  });

  it("returns the /zh link for a zh-HK contact", async () => {
    const {deps} = harness("zh-HK");
    const result = await createLeadInvite(admin, contactId, "startup", deps);
    expect(result.url).toBe(`https://wtia.example.test/zh/join/invite/${TOKEN}`);
  });

  it("refuses patron before touching the repository", async () => {
    const {deps} = harness();
    await expect(createLeadInvite(admin, contactId, "patron", deps)).rejects.toThrow();
    expect(deps.invites.create).not.toHaveBeenCalled();
  });

  it("refuses a non-admin actor", async () => {
    const {deps} = harness();
    await expect(createLeadInvite(ANONYMOUS_ACTOR as never, contactId, "community", deps)).rejects.toThrow("FORBIDDEN");
    expect(deps.invites.create).not.toHaveBeenCalled();
  });

  // Final review I3: a new link silently retired one the lead may already hold.
  it.each(["live", "opened"])("refuses to supersede a %s link without the explicit confirmation", async (state) => {
    const {deps} = harness("en", {latestState: state});
    await expect(createLeadInvite(admin, contactId, "community", deps)).rejects.toThrow("INVITE_SUPERSEDE_UNCONFIRMED");
    await expect(createLeadInvite(admin, contactId, "community", deps, false)).rejects.toThrow("INVITE_SUPERSEDE_UNCONFIRMED");
    expect(deps.invites.create).not.toHaveBeenCalled();
    await expect(createLeadInvite(admin, contactId, "community", deps, true)).resolves.toMatchObject({inviteId});
  });

  it.each(["consumed", "expired", "superseded"])("needs no confirmation when the latest link is %s", async (state) => {
    const {deps} = harness("en", {latestState: state});
    await expect(createLeadInvite(admin, contactId, "community", deps)).resolves.toMatchObject({inviteId});
  });
});

describe("sendLeadInviteEmail", () => {
  const url = `https://wtia.example.test/join/invite/${TOKEN}`;

  it("sends the contact's English copy with replyTo and a stable idempotency key", async () => {
    const {deps, sent, recorded} = harness("en");
    const result = await sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: "Looking forward to it."}, deps);
    expect(result).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "ada@example.hk", from: "WTIA <hello@wtia.example.test>", replyTo: "sam@wtia.example.test",
      idempotencyKey: `lead-invite:${inviteId}`,
    });
    expect(sent[0]!.subject).toBe(en.Email.templates.lead_join_invite.subject);
    expect(sent[0]!.html).toContain(url);
    expect(sent[0]!.html).toContain("Looking forward to it.");
    expect(recorded).toEqual([{contactId, inviteId, channel: "email", status: "sent"}]);
  });

  it("uses the zh-HK copy for a zh-HK contact", async () => {
    const {deps, sent} = harness("zh-HK");
    await sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: `https://wtia.example.test/zh/join/invite/${TOKEN}`, message: ""}, deps);
    expect(sent[0]!.subject).toBe(zh.Email.templates.lead_join_invite.subject);
  });

  it("omits replyTo when the acting profile has no email", async () => {
    const {deps, sent} = harness("en", {staffEmail: null});
    await sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: ""}, deps);
    expect("replyTo" in sent[0]!).toBe(false);
  });

  it("returns failed and records invite_sent with status failed on a delivery failure", async () => {
    const {deps, recorded} = harness("en", {failWith: new DeliveryFailure("retryable_server")});
    await expect(sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: ""}, deps)).resolves.toBe("failed");
    expect(recorded).toEqual([{contactId, inviteId, channel: "email", status: "failed"}]);
  });

  it("never records the link itself", async () => {
    const {deps, recorded} = harness("en");
    await sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: ""}, deps);
    expect(JSON.stringify(recorded)).not.toContain(TOKEN);
  });

  it("refuses a link that is not one of our invite URLs", async () => {
    const {deps, sent} = harness("en");
    await expect(sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: "https://evil.example/join/invite/x", message: ""}, deps)).rejects.toThrow();
    expect(sent).toHaveLength(0);
  });

  // Final review M3: the URL, the invite id and the contact must be one invite.
  it("checks the link's token belongs to that invite and contact, and refuses a mismatch", async () => {
    const good = harness("en");
    await sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: ""}, good.deps);
    expect(good.deps.invites.tokenBelongsTo).toHaveBeenCalledWith(admin, {token: TOKEN, inviteId, contactId});

    const bad = harness("en", {tokenMatches: false});
    await expect(sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: ""}, bad.deps)).rejects.toThrow("INVITE_URL_MISMATCH");
    expect(bad.sent).toHaveLength(0);
    expect(bad.recorded).toHaveLength(0);
  });

  it("refuses a contact with no email address", async () => {
    const {deps, sent} = harness("en", {email: null});
    await expect(sendLeadInviteEmail(admin, {contactId, inviteId, inviteUrl: url, message: ""}, deps)).rejects.toThrow("CONTACT_EMAIL_MISSING");
    expect(sent).toHaveLength(0);
  });
});

describe("whatsappInviteHref", () => {
  it("builds a wa.me link with digits only and an encoded text", () => {
    expect(whatsappInviteHref("+85291234567", "Hi & welcome")).toBe("https://wa.me/85291234567?text=Hi%20%26%20welcome");
  });
});

describe("LeadJoinLinkPanel", () => {
  afterEach(cleanup);

  async function panel(props: {hasEmail: boolean; phone: string | null; supersedes?: boolean}) {
    const {LeadJoinLinkPanel} = await import("@/components/admin/lead-join-link-panel");
    const t = en.Admin.contacts.lead.invite;
    render(
      <LeadJoinLinkPanel
        contactId={contactId}
        createAction={async () => ({status: "created", url: "https://wtia.example.test/join/invite/abc", inviteId}) as const}
        emailAction={async () => ({status: "idle"}) as const}
        hasEmail={props.hasEmail}
        labels={{
          title: t.title, plan: t.plan, plans: t.plans, create: t.create, linkLabel: t.linkLabel, copy: t.copy,
          copied: t.copied, messageLabel: t.messageLabel, email: t.email, whatsapp: t.whatsapp, sent: t.sent,
          failed: t.failed, noEmail: t.noEmail, noPhone: t.noPhone, error: t.error,
          supersedeWarning: t.supersedeWarning, supersedeConfirm: t.supersedeConfirm,
        }}
        phoneE164={props.phone}
        recordShared={async () => undefined}
        supersedesLiveLink={props.supersedes ?? false}
      />,
    );
    if (props.supersedes) fireEvent.click(screen.getByRole("checkbox", {name: t.supersedeConfirm}));
    fireEvent.click(screen.getByRole("button", {name: t.create}));
    expect(await screen.findByLabelText(t.linkLabel)).toHaveValue("https://wtia.example.test/join/invite/abc");
    return t;
  }

  it("offers Email and WhatsApp when the contact has both", async () => {
    const t = await panel({hasEmail: true, phone: "+85291234567"});
    expect(screen.getByRole("button", {name: t.email})).toBeEnabled();
    expect(screen.getByRole("link", {name: t.whatsapp})).toHaveAttribute("href", expect.stringContaining("https://wa.me/85291234567?text="));
    expect(screen.queryByText(t.noEmail)).toBeNull();
  });

  it("disables Email without an address and WhatsApp without a number, saying why", async () => {
    const t = await panel({hasEmail: false, phone: null});
    expect(screen.getByRole("button", {name: t.email})).toBeDisabled();
    expect(screen.getByRole("button", {name: t.whatsapp})).toBeDisabled();
    expect(screen.getByText(t.noEmail)).toBeInTheDocument();
    expect(screen.getByText(t.noPhone)).toBeInTheDocument();
  });

  it("warns before superseding a sent or opened link and holds Create until the confirm is ticked", async () => {
    const {LeadJoinLinkPanel} = await import("@/components/admin/lead-join-link-panel");
    const t = en.Admin.contacts.lead.invite;
    const createAction = vi.fn(async () => ({status: "idle"}) as const);
    render(
      <LeadJoinLinkPanel
        contactId={contactId}
        createAction={createAction}
        emailAction={async () => ({status: "idle"}) as const}
        hasEmail
        labels={{
          title: t.title, plan: t.plan, plans: t.plans, create: t.create, linkLabel: t.linkLabel, copy: t.copy,
          copied: t.copied, messageLabel: t.messageLabel, email: t.email, whatsapp: t.whatsapp, sent: t.sent,
          failed: t.failed, noEmail: t.noEmail, noPhone: t.noPhone, error: t.error,
          supersedeWarning: t.supersedeWarning, supersedeConfirm: t.supersedeConfirm,
        }}
        phoneE164={null}
        recordShared={async () => undefined}
        supersedesLiveLink
      />,
    );
    expect(screen.getByText(t.supersedeWarning)).toBeInTheDocument();
    const create = screen.getByRole("button", {name: t.create});
    expect(create).toBeDisabled();
    const confirm = screen.getByRole("checkbox", {name: t.supersedeConfirm});
    expect(confirm).toBeRequired();
    expect(confirm).toHaveAttribute("name", "confirmSupersede");
    fireEvent.click(confirm);
    expect(create).toBeEnabled();
  });

  it("shows no warning and no confirm when nothing live would be superseded", async () => {
    await panel({hasEmail: true, phone: null});
    const t = en.Admin.contacts.lead.invite;
    expect(screen.queryByText(t.supersedeWarning)).toBeNull();
    expect(screen.queryByRole("checkbox", {name: t.supersedeConfirm})).toBeNull();
  });

  it("creates after the confirm when a live link exists", async () => {
    await panel({hasEmail: true, phone: null, supersedes: true});
  });
});
