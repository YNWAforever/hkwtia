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
