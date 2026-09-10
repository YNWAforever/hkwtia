import "server-only";

import type {WhatsAppTemplateKey} from "@/config/whatsapp-templates";
import {
  deliverWoztellReply,
  type WoztellDeliveryDependencies,
} from "@/lib/ai/woztell-delivery";
import type {WoztellRunRecovery} from "@/lib/ai/woztell-run-recovery";
import type {NormalizedInbound} from "@/lib/channels/types";
import {normalizeWhatsAppNumber} from "@/lib/channels/woztell";
import type {ConversationOwner} from "@/lib/db/repos/conversations";
import type {WhatsAppEligibility} from "@/lib/db/repos/message-eligibility";
import type {ConversationHandling} from "@/lib/db/server-schema";

export {
  decideWoztellRunRecovery,
} from "@/lib/ai/woztell-run-recovery";
export type {
  WoztellAgentRunSnapshot,
  WoztellRunRecovery,
} from "@/lib/ai/woztell-run-recovery";

export type WoztellProfile = Readonly<{
  id: string;
  displayName: string;
  locale: "en" | "zh-HK";
  whatsappOptIn: boolean;
}>;

export type WoztellClaimState =
  | "claimed"
  | "running"
  | "reply_ready"
  | "completed";

export function decideWoztellClaimState(input: Readonly<{
  state: WoztellClaimState;
  leaseUntil: Date | null;
  now: Date;
}>): "resume" | "duplicate" {
  if (input.state === "completed") return "duplicate";
  if (
    input.leaseUntil
    && Number.isFinite(input.leaseUntil.getTime())
    && input.leaseUntil.getTime() > input.now.getTime()
  ) {
    return "duplicate";
  }
  return "resume";
}

export type WoztellInboundClaim =
  | Readonly<{status: "duplicate"}>
  | Readonly<{
    status: "accepted";
    conversationId: string;
    owner: ConversationOwner;
    profileId: string | null;
    locale: "en" | "zh-HK";
    memberName: string;
    whatsappOptIn: boolean;
    /** C-1. The interlock between the concierge and a person, read from the row
     * the claim transaction locked rather than checked separately afterwards —
     * a second read is a second answer, and the bot would answer a message a
     * person is already answering. Task 4 branches on it. */
    handling: ConversationHandling;
    /** C-1 Task 4. Who the human lane notifies. NULL is the normal state of an
     * unassigned thread and files the task against no profile — `staff_tasks`
     * .profile_id is nullable precisely so a prospect's thread can raise one. */
    assignedToProfileId: string | null;
    /** The 24-hour customer-service window is measured from here, never from
     * `last_message_at`, which every outbound reply bumps. */
    lastInboundAt: Date | null;
    pendingReply?: string;
  }>;

export type WoztellInboundClaimInput = Readonly<{
  owner: ConversationOwner;
  profileId: string | null;
  locale: "en" | "zh-HK";
  memberName: string;
  whatsappOptIn: boolean;
  sender: string;
  providerMessageId: string;
  receivedAt: Date;
  content: string;
  channel: "whatsapp";
  /** C-1. Stored on the conversation, which carries no unique index on it and is
   * therefore always safe to write — unlike `contacts.whatsapp_member_id`, whose
   * separate partial unique index is not the upsert's conflict target. */
  whatsappMemberId: string | null;
  /** D-6/S-3: a link, not an owner arm. `conversations_owner_check` stays
   * two-armed and the HMAC stays the owner key. */
  contactId: string | null;
}>;

/**
 * The two provider-event payloads the processor forwards, derived from the
 * normaliser's own arms so a correction to the (unverified — plan O-1) payload
 * shape lands in one place. `kind` is deliberately dropped: the repositories
 * behind these parse `.strict()`, so spreading the discriminator through would
 * be a ZodError — a 500, and a Woztell retry loop for every delivery tick.
 */
export type WoztellDeliveryStatusEvent =
  Omit<Extract<NormalizedInbound, {kind: "delivery_status"}>, "kind">;
export type WoztellOutboundEchoEvent =
  Omit<Extract<NormalizedInbound, {kind: "outbound_echo"}>, "kind">;

export type WoztellConciergeTurnInput = Readonly<{
  owner: ConversationOwner;
  profileId: string | null;
  conversationId: string;
  providerMessageId: string;
  message: string;
  locale: "en" | "zh-HK";
  trigger: "whatsapp";
  inboundMessagePersisted: true;
}>;

export type WoztellConciergeTurn = Readonly<{
  conversationId: string;
  runId: string;
  events: AsyncIterable<Readonly<{
    event: string;
    data: Readonly<Record<string, unknown>>;
  }>>;
  cancel: () => Promise<void>;
}>;

export type WoztellEscalationReason =
  | "approved_template_unavailable"
  | "channel_delivery_failed"
  | "channel_delivery_uncertain"
  | "concierge_turn_failed"
  | "concierge_run_ambiguous";

export type WoztellWebhookProcessorDependencies =
  WoztellDeliveryDependencies & Readonly<{
    resolveProfile: (normalizedSender: string) => Promise<WoztellProfile | null>;
    claimInbound: (
      input: WoztellInboundClaimInput,
    ) => Promise<WoztellInboundClaim>;
    recoverRun?: (
      providerMessageId: string,
      conversationId: string,
    ) => Promise<WoztellRunRecovery>;
    markRunOwned?: (
      providerMessageId: string,
      leaseUntil: Date,
    ) => Promise<void>;
    markReplyReady?: (
      providerMessageId: string,
      reply: string,
      leaseUntil: Date,
    ) => Promise<void>;
    markCompleted?: (providerMessageId: string) => Promise<void>;
    setWhatsappOptIn: (profileId: string, optedIn: boolean) => Promise<void>;
    /**
     * Unknown sender → contacts row (programme D-6). Optional so existing tests
     * keep passing. C-1 Task 4 threads the Woztell member id through it and takes
     * the contact id back, because `claimInbound` needs it for
     * `conversations.contact_id` (D-6/S-3: a link, not an owner arm).
     */
    recordContact?: (input: Readonly<{
      phoneE164: string;
      locale: "en" | "zh-HK";
      receivedAt: Date;
      whatsappMemberId: string | null;
    }>) => Promise<Readonly<{id: string}>>;
    /**
     * C-1 Task 4. Optional so the existing fixtures stay green — and that is
     * exactly the trap `recordContact` set: an optional dependency the production
     * wiring forgets is a silent no-op no test notices. `tests/unit/
     * woztell-production-wiring.test.ts` is the guard that each of these is
     * actually wired.
     */
    recordDeliveryStatus?: (
      event: WoztellDeliveryStatusEvent,
    ) => Promise<Readonly<{matched: boolean}>>;
    recordOutboundEcho?: (
      event: WoztellOutboundEchoEvent,
    ) => Promise<Readonly<{disposition: "adopted" | "inserted" | "duplicate"}>>;
    notifyAssignee?: (input: Readonly<{
      conversationId: string;
      assignedToProfileId: string | null;
      locale: "en" | "zh-HK";
    }>) => Promise<void>;
    /** STOP/取消 → message_suppressions + contact opt-out (D-7). */
    recordOptOut?: (input: Readonly<{profileId: string | null; phoneE164: string}>) => Promise<void>;
    /**
     * The C-1 consent review. "May the concierge answer this person?", asked of
     * `lib/db/repos/message-eligibility.ts` — the one module that answers it for
     * the staff lane too, over BOTH consent stores. Optional only so the
     * existing fixtures stay green; `tests/unit/woztell-production-wiring.test.ts`
     * is what stops that optionality becoming a silently reopened hole.
     *
     * `purpose` is the literal `"service"` and not the union: a bot reply is
     * always an answer inside the customer-service window, and a call site that
     * could ask for `"marketing"` would be asking the wrong question.
     */
    checkSendEligibility?: (input: Readonly<{
      profileId: string | null;
      contactId: string | null;
      phoneE164: string;
      purpose: "service";
    }>) => Promise<WhatsAppEligibility>;
    concierge: Readonly<{
      startTurn(input: WoztellConciergeTurnInput): Promise<WoztellConciergeTurn>;
    }>;
    escalate: (input: Readonly<{
      conversationId: string;
      profileId: string | null;
      providerMessageId: string;
      locale: "en" | "zh-HK";
      reason: WoztellEscalationReason;
    }>) => Promise<void>;
    anonymousOwnerHash: (normalizedSender: string) => string;
    approvedTemplateKeys: ReadonlySet<WhatsAppTemplateKey>;
    supportUrl: string;
    now?: () => Date;
  }>;

/**
 * C-1 Task 4. `lib/api/woztell-webhook-route.ts` returns this object AS the 202
 * body, so every discriminator here is readable in Woztell's own webhook
 * delivery log — the only observability this subsystem has. There is no counter,
 * no dead-letter table and deliberately no log line (provider bodies carry
 * credentials and PII, and `tests/unit/woztell-adapter.test.ts` asserts the
 * adapter never calls console). The bare `{status: "ignored"}` arm is gone
 * because "we did nothing" and "we could not read the sender" were the same
 * answer, and at C-9 that is the difference between reading a classification and
 * guessing. The discriminators carry no sender, no text and no provider body.
 */
export type WoztellProcessResult =
  | Readonly<{status: "accepted"}>
  | Readonly<{status: "duplicate"}>
  | Readonly<{
    status: "ignored";
    reason: "unsupported_event" | "unnormalizable_sender";
  }>
  | Readonly<{status: "delivery_recorded"; matched: boolean}>
  | Readonly<{
    status: "echo_recorded";
    disposition: "adopted" | "inserted" | "duplicate";
  }>
  | Readonly<{status: "human_handled"}>
  | Readonly<{status: "opted_out"}>
  | Readonly<{status: "escalated"}>;

type WoztellTurnOutcome =
  | Readonly<{status: "done"; text: string}>
  | Readonly<{status: "error"}>
  | Readonly<{status: "disabled"}>;

const EFFECT_LEASE_MS = 5 * 60 * 1_000;

/**
 * Exported for C-3's backfill (`lib/api/woztell-backfill-route.ts`), which
 * imports the SAME rule rather than carrying a third copy of the CJK test. A
 * backfill that guessed locale differently from the webhook would label half a
 * thread `en` and half `zh-HK`, and the conversation carries one locale.
 */
export function localeFor(
  text: string,
  profile: WoztellProfile | null,
): "en" | "zh-HK" {
  if (profile) return profile.locale;
  return /[\u3400-\u9fff]/u.test(text) ? "zh-HK" : "en";
}

async function turnOutcome(
  turn: WoztellConciergeTurn,
): Promise<WoztellTurnOutcome> {
  let text = "";
  for await (const event of turn.events) {
    if (event.event === "delta" && typeof event.data.text === "string") {
      text += event.data.text;
    } else if (event.event === "error") {
      return {status: "error"};
    } else if (event.event === "disabled") {
      return {status: "disabled"};
    } else if (event.event === "done") {
      return {status: "done", text: text.trim()};
    }
  }
  return {status: "error"};
}

/**
 * The bot lane blocks on a CONSENT answer and never on a reachability one.
 *
 * `messageEligibility` reads the STORED number — `profiles.whatsapp_number` is
 * free text, and a sender whose contact row was never written has no row to read
 * at all — while this lane is replying into an open session on the number the
 * message just arrived from, which it already holds. Blocking on `no_number`
 * here would silence the concierge for every member whose stored number carries
 * a space, for no consent reason whatsoever.
 *
 * A real STOP can never reach us wearing that reason: `decideWhatsApp` tests the
 * withdrawal FIRST, before it looks at any number, so `no_number` means only
 * "nothing sendable is recorded", never "somebody told us to stop".
 */
function blockedByConsent(eligibility: WhatsAppEligibility): boolean {
  return eligibility.status === "blocked" && eligibility.reason !== "no_number";
}

function ownerFor(
  profile: WoztellProfile | null,
  normalizedSender: string,
  dependencies: WoztellWebhookProcessorDependencies,
): ConversationOwner {
  return profile
    ? {kind: "profile", profileId: profile.id}
    : {
      kind: "anonymous",
      anonymousOwnerHash: dependencies.anonymousOwnerHash(normalizedSender),
    };
}

export function createWoztellWebhookProcessor(
  dependencies: WoztellWebhookProcessorDependencies,
) {
  const now = dependencies.now ?? (() => new Date());
  const leaseUntil = () => new Date(now().getTime() + EFFECT_LEASE_MS);
  return Object.freeze({
    async process(payload: unknown): Promise<WoztellProcessResult> {
      const normalized: NormalizedInbound =
        dependencies.channel.normalizeInbound(payload);
      // C-1 Task 4. These three branches sit above the inbound lane because none
      // of them has a sender to normalise or a message to answer. A status event
      // in particular carries no text at all, so reaching normalizeWhatsAppNumber
      // with one is not a degraded path — it is a bug this ordering makes
      // unrepresentable.
      if (normalized.kind === "unsupported") {
        return {status: "ignored", reason: "unsupported_event"};
      }
      if (normalized.kind === "delivery_status") {
        // A missing writer reports `matched: false` rather than `true`: an
        // unwired dependency must read as "nothing was recorded", never as a
        // tick that landed.
        const recorded = await dependencies.recordDeliveryStatus?.({
          providerMessageId: normalized.providerMessageId,
          status: normalized.status,
          errorCode: normalized.errorCode,
          occurredAt: normalized.occurredAt,
        }) ?? {matched: false};
        return {status: "delivery_recorded", matched: recorded.matched};
      }
      if (normalized.kind === "outbound_echo") {
        const recipient = normalizeWhatsAppNumber(normalized.recipient);
        if (!recipient) return {status: "ignored", reason: "unnormalizable_sender"};
        const recorded = await dependencies.recordOutboundEcho?.({
          recipient,
          text: normalized.text,
          providerMessageId: normalized.providerMessageId,
          origin: normalized.origin,
          sentAt: normalized.sentAt,
        }) ?? {disposition: "duplicate" as const};
        return {status: "echo_recorded", disposition: recorded.disposition};
      }

      const sender = normalizeWhatsAppNumber(normalized.sender);
      if (!sender) return {status: "ignored", reason: "unnormalizable_sender"};
      const profile = await dependencies.resolveProfile(sender);
      const locale = localeFor(normalized.text, profile);
      const owner = ownerFor(profile, sender, dependencies);
      let contactId: string | null = null;
      if (!profile) {
        // A stranger who writes in is the funnel's first signal (programme D-6):
        // keep the number so a person can follow up, before any bot reply. The
        // id comes back so the claim can link the conversation to the contact.
        const contact = await dependencies.recordContact?.({
          phoneE164: sender,
          locale,
          receivedAt: normalized.receivedAt,
          whatsappMemberId: normalized.whatsappMemberId,
        });
        contactId = contact?.id ?? null;
      }
      const claim = await dependencies.claimInbound({
        owner,
        profileId: profile?.id ?? null,
        locale,
        memberName: profile?.displayName ?? "Member",
        whatsappOptIn: profile?.whatsappOptIn ?? true,
        sender,
        providerMessageId: normalized.providerMessageId,
        receivedAt: normalized.receivedAt,
        content: normalized.text,
        channel: "whatsapp",
        whatsappMemberId: normalized.whatsappMemberId,
        // D-6/S-3: a link, not an owner arm. `claimInbound` COALESCEs it, so a
        // later inbound that resolves no contact cannot erase one we already
        // learned.
        contactId,
      });
      if (claim.status === "duplicate") return {status: "duplicate"};

      // C-1 Task 4 reorders the three post-claim branches. The old order was
      // `!whatsappOptIn` → opt_out → bot, and it got two cases wrong.

      // 1. STOP first, always, whatever the handling state and whatever the flag
      //    says. Under the old order a withdrawal from a member who was already
      //    opted out returned before this branch, so the second STOP wrote no
      //    suppression and no contact opt-out at all.
      if (normalized.intent === "opt_out") {
        // The order of these two calls is the C-1 consent review's fix, and it
        // is load-bearing. `recordOptOut` runs
        // `suppressionsRepository.optOutWhatsApp`, which treats the
        // `whatsapp_opt_in` TRANSITION as the second, independent evidence that
        // a withdrawal is new — the first being the suppression INSERT, which
        // conflicts forever after the first STOP because nothing in this tree
        // ever deletes a suppression row (`lib/db/repos/suppressions.ts` says
        // so). Clearing the flag HERE first spent that evidence on every call,
        // so a member who re-granted WhatsApp in the portal
        // (`lib/portal/command-core.ts` sets the flag back) and then said STOP
        // again had BOTH halves answer "already done": the guarded UPDATE
        // matched nothing, the INSERT conflicted, and the audit row was skipped.
        // The contact leg cannot save it either — `recordContact` never runs for
        // a resolved profile, and where a contact row exists the first STOP
        // already stamped `whatsapp_opted_out_at`, so `markWhatsAppOptedOut`
        // returns `already_revoked` and audits nothing. Net: a real, member-
        // initiated withdrawal invisible in `audit_events`, which is boundary 11.
        //
        // `setWhatsappOptIn` stays, after, because `recordOptOut` is optional
        // and it is the only thing that clears the flag for a wiring without it.
        // In production it is now a no-op: `optOutWhatsApp`'s own guarded UPDATE
        // has already written the same value, in the same transaction as the
        // audit row. Running it second also means a throw in `recordOptOut` can
        // no longer leave the flag cleared with nothing recording why — the
        // state that broke the boundary in the first place.
        await dependencies.recordOptOut?.({profileId: claim.profileId, phoneE164: sender});
        if (claim.profileId) {
          await dependencies.setWhatsappOptIn(claim.profileId, false);
        }
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "opted_out"};
      }

      // 2. The human lane, BEFORE the opt-in gate, because persisting and
      //    notifying is not sending. `claimInbound` has already stored the
      //    message; an opted-out member writing into a staff-owned thread has it
      //    stored either way, and under the old order the `!whatsappOptIn` return
      //    fired first and staff were simply never told — the one case where the
      //    inbox goes quiet for a reason nobody can see from the inside. Nothing
      //    is sent here, so the marketing flag has no say; whether staff may
      //    *reply* is decided later, by messageEligibility.
      //
      //    The interlock is read from the row `claimInbound` locked rather than
      //    re-checked here, or the bot answers a message a person is already
      //    answering.
      if (claim.handling === "human") {
        await dependencies.notifyAssignee?.({
          conversationId: claim.conversationId,
          assignedToProfileId: claim.assignedToProfileId,
          locale: claim.locale,
        });
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "human_handled"};
      }

      // 3. The consent gate, guarding only the BOT lane it was written for — and
      //    no longer answering the question from `claim.whatsappOptIn`.
      //
      //    That flag is `profile?.whatsappOptIn ?? true`, so a sender with no
      //    profile arrived here opted in by construction, and this lane read
      //    nothing else: a PROSPECT who said STOP — their withdrawal recorded on
      //    `contacts.whatsapp_opted_out_at`, the only column that can hold it,
      //    because `message_suppressions.profile_id` is NOT NULL — got a
      //    concierge reply the next time they wrote. The `?? true` predates C-1;
      //    C-1 made it materially larger by giving prospects a real contact lane.
      //
      //    The decision now comes from `messageEligibility`, the SAME module the
      //    staff lane asks, over the same facts loader and the same precedence
      //    table, so the two lanes cannot disagree about one person. The flag is
      //    still passed to the delivery leg below, where it means something else
      //    entirely: the adapter refuses to send when it is false
      //    (`recipientNumber` in lib/channels/woztell.ts), and `?? true` is what
      //    lets the concierge answer a prospect at all.
      const consent = await dependencies.checkSendEligibility?.({
        profileId: claim.profileId,
        contactId,
        phoneE164: sender,
        purpose: "service",
      });
      if (consent ? blockedByConsent(consent) : !claim.whatsappOptIn) {
        await dependencies.markCompleted?.(normalized.providerMessageId);
        return {status: "opted_out"};
      }

      let text = claim.pendingReply;
      if (text === undefined) {
        const recovery = await dependencies.recoverRun?.(
          normalized.providerMessageId,
          claim.conversationId,
        ) ?? {status: "start_new" as const};
        if (recovery.status === "escalate_ambiguous") {
          await dependencies.escalate({
            conversationId: claim.conversationId,
            profileId: claim.profileId,
            providerMessageId: normalized.providerMessageId,
            locale: claim.locale,
            reason: "concierge_run_ambiguous",
          });
          await dependencies.markCompleted?.(normalized.providerMessageId);
          return {status: "escalated"};
        }
        if (recovery.status === "reply_ready") {
          text = recovery.reply;
          await dependencies.markReplyReady?.(
            normalized.providerMessageId,
            text,
            leaseUntil(),
          );
        } else {
          await dependencies.markRunOwned?.(
            normalized.providerMessageId,
            leaseUntil(),
          );
          const turn = await dependencies.concierge.startTurn({
            owner: claim.owner,
            profileId: claim.profileId,
            conversationId: claim.conversationId,
            providerMessageId: normalized.providerMessageId,
            message: normalized.text,
            locale: claim.locale,
            trigger: "whatsapp",
            inboundMessagePersisted: true,
          });
          const outcome = await turnOutcome(turn);
          if (outcome.status !== "done") {
            await dependencies.escalate({
              conversationId: claim.conversationId,
              profileId: claim.profileId,
              providerMessageId: normalized.providerMessageId,
              locale: claim.locale,
              reason: "concierge_turn_failed",
            });
            await dependencies.markCompleted?.(normalized.providerMessageId);
            return {status: "escalated"};
          }
          text = outcome.text;
          if (!text) {
            await dependencies.markCompleted?.(normalized.providerMessageId);
            return {status: "accepted"};
          }
          await dependencies.markReplyReady?.(
            normalized.providerMessageId,
            text,
            leaseUntil(),
          );
        }
      }

      return deliverWoztellReply({
        providerMessageId: normalized.providerMessageId,
        sender,
        receivedAt: normalized.receivedAt,
        text,
        locale: claim.locale,
        memberName: claim.memberName,
        whatsappOptIn: claim.whatsappOptIn,
        complete: async () => {
          await dependencies.markCompleted?.(normalized.providerMessageId);
        },
        escalate: async (reason) => {
          await dependencies.escalate({
            conversationId: claim.conversationId,
            profileId: claim.profileId,
            providerMessageId: normalized.providerMessageId,
            locale: claim.locale,
            reason,
          });
        },
      }, dependencies);
    },
  });
}
