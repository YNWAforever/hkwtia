export const woztellEnv = {
  WOZTELL_API_TOKEN: "woztell-test-token",
  WOZTELL_CHANNEL_ID: "channel-123",
  WOZTELL_WEBHOOK_SECRET: "webhook-test-secret",
  RUN_LIVE_WOZTELL: "1",
} as const;

export const eligibleWhatsAppRecipient = {
  whatsappOptIn: true,
  whatsappNumber: " 85290000000 ",
  lastCustomerMessageAt: new Date(),
} as const;

// Programme C-1, plan O-1. The three payloads below are PROVISIONAL. There are
// no Woztell credentials, no captured provider payload and no provider
// documentation anywhere in this tree — the only inbound envelope that has ever
// existed here is `{from, type:"TEXT", messageId, timestamp, data:{text}}`, and
// the discriminators these fixtures exercise are the plan's best guess at the
// delivery-status and outbound-echo shapes. They are deliberately kept together
// with the single function that reads them (`normalizedInbound` in
// lib/channels/woztell.ts) so correcting them against a real payload is a
// two-file change. C-9's checklist replays one captured payload of each kind
// through `normalizeInbound` before RUN_LIVE_WOZTELL=1 is flipped; until then,
// "the ticks do not arrive" is a normaliser problem first.

/** The pre-Phase-C inbound envelope: every payload shape this repository has
 * ever seen, and the one that carries no member id at all. */
export const woztellInboundTextPayload = {
  from: "85290000000",
  type: "TEXT",
  messageId: "wamid.inbound.member",
  timestamp: "2026-09-10T01:00:00.000Z",
  data: {text: "Hello"},
} as const;

/** The same envelope carrying the Woztell member id. The id is padded on
 * purpose: the normaliser trims it, and Task 3 writes the trimmed value
 * straight into `conversations.whatsapp_member_id`. */
export const woztellInboundWithMemberIdPayload = {
  ...woztellInboundTextPayload,
  memberId: "  member-9001  ",
} as const;

/** Delivery tick for an OUTBOUND message. `status` is upper-case here because
 * the guess is that the provider sends it that way; the normaliser lower-cases
 * before matching so either casing lands on the same variant. */
export const woztellDeliveryStatusPayload = {
  type: "MESSAGE_STATUS",
  messageId: "wamid.outbound.1",
  timestamp: "2026-09-10T01:05:00.000Z",
  data: {status: "DELIVERED"},
} as const;

/** Echo of a message the provider sent on our behalf. `origin` is what decides
 * whether the row lands as the concierge's (`BOT`) or a person's (`MANUAL` /
 * `RELAY`), so it is a required field, not a hint. */
export const woztellOutboundEchoPayload = {
  type: "OUTBOUND",
  to: "85290000000",
  messageId: "wamid.echo.1",
  timestamp: "2026-09-10T01:06:00.000Z",
  origin: "MANUAL",
  data: {text: "  Thanks for writing in.  "},
} as const;
