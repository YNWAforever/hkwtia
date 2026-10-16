export type ConversationChannelSeedMessage = Readonly<{channel: "web" | "whatsapp"; createdAt: Date}>;

/** Twin of 0032's conversations.channel backfill. Deliberately NOT the
 * latest-message rule lib/db/repos/inbox.ts used: a WhatsApp thread whose newest
 * message is a web reply is still a WhatsApp thread, and the send path has to
 * know whether it may reach for the WhatsApp adapter at all. Empty → 'web',
 * because a conversation with no messages has no WhatsApp evidence. */
export function derivedConversationChannel(messages: readonly ConversationChannelSeedMessage[]): "web" | "whatsapp" {
  return messages.some((message) => message.channel === "whatsapp") ? "whatsapp" : "web";
}
