export const conciergeLabelKeys = [
  "launcher",
  "title",
  "description",
  "close",
  "messageLabel",
  "contactEmailLabel",
  "contactEmailHelper",
  "contactEmailError",
  "placeholder",
  "send",
  "sending",
  "cancel",
  "empty",
  "you",
  "assistant",
  "sources",
  "retry",
  "error",
  "offline",
  "disabled",
  "leaveMessage",
  "escalated",
  "reference",
  "feedbackPrompt",
  "feedbackLabel",
  "feedbackThanks",
  "feedbackError",
  "characterCount",
  "verificationLabel",
  "verificationPending",
  "verificationError",
] as const;

export type ConciergeLabelKey = typeof conciergeLabelKeys[number];
export type ConciergeLabels = Readonly<Record<ConciergeLabelKey, string>>;

export function localizeConcierge(
  translate: (key: ConciergeLabelKey) => string,
): ConciergeLabels {
  return Object.fromEntries(
    conciergeLabelKeys.map((key) => [key, translate(key)]),
  ) as ConciergeLabels;
}
